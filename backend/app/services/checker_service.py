"""AI-text checker: a strict client for the trained checker model, which runs as a separate service.

The model (DeBERTa-v3-base, human / AI / mixed document head plus a per-sentence head) is served by its own
model server. This module sends it the text, maps its answer onto the app's response shape, and turns every
failure into one calm "temporarily unavailable" error. There is deliberately no fallback detector: when the
server cannot be reached the user is told so, not given a different, unmeasured answer.

Failure handling: a short connect timeout, a bounded read timeout and a small circuit breaker, so a dead
server is not hit again for a moment after a few consecutive failures.
"""

import logging
import re
import time
import unicodedata

import httpx

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)

# Said plainly and only what our own measurements support: it can wrongly flag human writing, and it is
# weaker on AI text that was edited or rewritten to sound human.
DISCLAIMER = (
    "An estimate, not proof. This checker can occasionally flag human writing, and it can miss AI text "
    "that was edited or rewritten to sound human. \"Unsure\" means the model could not decide. Do not use "
    "this result to accuse or penalise anyone."
)

# Said with the numbers from our own held-out tests of the pv10 model (about 9,000 human and 5,700 AI texts, a hard mix that
# includes rewritten and attacked AI): roughly 1 human text in 160 was called AI or likely AI and roughly 1 AI text in 12
# was called human or likely human. These are test figures, not a promise about any one text.
DISCLAIMER_PV10 = (
    "An estimate, not proof. In our tests this checker called about 1 human text in 160 AI or likely AI, and "
    "called about 1 AI text in 12 human or likely human; it is weakest on AI text that was edited or rewritten "
    "to sound human. \"Unsure\" and \"Mixed\" mean the model could not call it one way. Do not use this result to "
    "accuse or penalise anyone."
)

# The sentence head separates "human-origin" from "AI-origin" sentences and is strongly two-sided. On held-out
# sentences these cut points colour about 92% of human sentences "human" (about 4% "ai") and about 80% of
# AI-origin sentences "ai"; roughly 6% fall between and are "unsure".
SENTENCE_HUMAN_MAX = 0.3
SENTENCE_AI_MIN = 0.7

_VERDICTS = {"human": "likely_human", "unsure": "uncertain", "ai": "likely_ai"}

# A wrong accusation costs far more than a miss, so "Likely AI" needs the sentences to agree with the overall score:
# at least this share of the scored sentences must be marked AI. On 1,882 held-out human texts this removed 7 of the 13
# that the overall score alone called AI, for about 1% fewer AI texts called AI (see the 2026-11-09 false-positive
# analysis). Anything it holds back is shown as "Unsure", never as "Likely human".
LIKELY_AI_MIN_RED_SHARE = 0.5


def _sentence_label(ai_score: float | None, human_max: float = SENTENCE_HUMAN_MAX, ai_min: float = SENTENCE_AI_MIN) -> str:
    if ai_score is None:
        return "unsure"
    if ai_score <= human_max:
        return "human"
    return "ai" if ai_score >= ai_min else "unsure"
_WORD_RE = re.compile(r"[A-Za-z0-9']+")

# ---- pv10 six-level rules
#
# The pv10 model is selected by the model id the checker server reports (the launcher sets CHECKER_MODEL_ID), so the
# server and these rules always change together and rolling back the server rolls the rules back with it. Every number
# below was fixed on validation data (plus two development sets) by a rule written down before scoring, then tested
# once on texts the model had not been tuned on.
PV10_MODEL_PREFIX = "ck_pv10"
PV10_HI = 0.9981            # score above this: "AI" (99.75th percentile of pooled human scores)
PV10_LIKELY_AI = 0.9956     # above this: "likely AI" (99.5th percentile)
PV10_HUMAN = 0.10           # at or below: "human" (largest cut with at most 1% of pooled AI at or below it)
PV10_LIKELY_HUMAN = 0.50    # at or below: "likely human" (raised from 0.35: at most +1 point of AI called human-ish)
PV10_MIXED_P = 0.5          # the model's own mixed probability at or above this: "mixed"
PV10_MIXT = 0.4             # long texts whose sentence windows disagree this much: "mixed"
PV10_MIXT_MIN_SENTENCES = 20
PV10_UNSURE_AI_FROM = 0.95  # between "unsure toward human" and "unsure toward AI"
# Sentence colours for pv10: at most about 4% of human-origin sentences coloured "ai" and 4% of AI-origin "human"
# on held-out sentences (the old cut points of 0.3 / 0.7 coloured 9% of human sentences "ai" with this model).
PV10_SENTENCE_HUMAN_MAX = 0.09
PV10_SENTENCE_AI_MIN = 0.97

Level = str  # "human" | "likely_human" | "unsure" | "mixed" | "likely_ai" | "ai"


def _window_disagreement(p_ai: list[float], window: int = 6, hi: float = 0.8, lo: float = 0.2) -> tuple[float, float, float]:
    """Share of rolling windows of sentences that read AI, share that read human, and the smaller of the two.
    A text whose windows split between the two is mixed even when its overall score is high."""
    n = len(p_ai)
    if n < window:
        return 0.0, 0.0, 0.0
    means = [sum(p_ai[i : i + window]) / window for i in range(n - window + 1)]
    ra = sum(m > hi for m in means) / len(means)
    rh = sum(m < lo for m in means) / len(means)
    return ra, rh, min(ra, rh)


def six_level(score: float, p: dict, p_ai_sentences: list[float | None]) -> tuple[Level, str | None]:
    """The pv10 verdict and, for "unsure" and "mixed", which way the model leans ("human" or "ai", else None)."""
    sp = [x for x in p_ai_sentences if x is not None]
    n = len(sp)
    ra, rh, mn = _window_disagreement(sp)
    if p["mixed"] >= PV10_MIXED_P or (n >= PV10_MIXT_MIN_SENTENCES and mn >= PV10_MIXT):
        lean_ai = ra >= rh if n >= 6 else p["ai"] >= p["human"]
        return "mixed", "ai" if lean_ai else "human"
    if score > PV10_HI:
        return "ai", None
    if score <= PV10_HUMAN:
        return "human", None
    if score <= PV10_LIKELY_HUMAN:
        return "likely_human", None
    if score <= PV10_UNSURE_AI_FROM:
        return "unsure", "human"
    if score <= PV10_LIKELY_AI:
        return "unsure", "ai"
    return "likely_ai", None


# What the older three-way field `verdict` says for each level, so an app that has not learned the new levels yet keeps working.
_LEGACY_VERDICT = {
    "human": "likely_human", "likely_human": "likely_human", "unsure": "uncertain",
    "mixed": "uncertain", "likely_ai": "likely_ai", "ai": "likely_ai",
}

# Look-alike letters (mostly Cyrillic and Greek) that people use to make a text read the same but look different to a
# detector, and characters that are invisible. On the RAID benchmark, text with look-alike letters was caught 0% of the
# time and text with hidden zero-width characters 60%; cleaning them first gave 54% and 95%, with no change in how many
# human texts were flagged. The checker is English-only, so this only runs on text that is mostly Latin letters.
_LOOKALIKES = {
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d",
    "һ": "h", "ɡ": "g", "ӏ": "l", "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P",
    "С": "C", "Т": "T", "Х": "X", "І": "I", "Ј": "J", "Ѕ": "S",
    "α": "a", "ο": "o", "ν": "v", "ρ": "p", "τ": "t", "υ": "u", "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H",
    "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
}
_INVISIBLE = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff\u00ad"), None)
_LATIN_LETTER = re.compile(r"[A-Za-z]")


def _clean_text(text: str) -> str:
    """Fold look-alike letters back to Latin and drop invisible characters, so they cannot hide AI text.

    Leaves text alone when it is mostly not Latin (a Russian or Greek text would otherwise turn into nonsense)."""
    text = unicodedata.normalize("NFKC", text).translate(_INVISIBLE)
    letters = [c for c in text if c.isalpha()]
    latin = sum(1 for c in letters if _LATIN_LETTER.match(c) or c in _LOOKALIKES)
    if not letters or sum(1 for c in letters if _LATIN_LETTER.match(c)) / len(letters) < 0.5:
        return text
    return "".join(_LOOKALIKES.get(c, c) for c in text) if latin else text


def _hold_back_unsupported_ai(verdict: str, sentences: list[dict]) -> str:
    """Downgrade "likely_ai" to "uncertain" when too few sentences are marked AI to back the overall score."""
    if verdict != "likely_ai":
        return verdict
    scored = [item["ai_score"] for item in sentences if item["ai_score"] is not None]
    if not scored:
        return verdict
    red_share = sum(score >= SENTENCE_AI_MIN for score in scored) / len(scored)
    if red_share < LIKELY_AI_MIN_RED_SHARE:
        logger.info("checker_ai_verdict_held_back red_share=%.2f sentences=%d", red_share, len(scored))
        return "uncertain"
    return verdict


def _unavailable() -> AppError:
    return AppError(
        code="CHECKER_UNAVAILABLE",
        message="The AI checker is temporarily unavailable. Please come back in a little while.",
        status_code=503,
    )


def _too_short(minimum: int) -> AppError:
    return AppError(
        code="TEXT_TOO_SHORT",
        message=f"Please enter at least {minimum} words for a reliable result.",
        status_code=422,
    )


def _too_few_sentences(words: int) -> AppError:
    """The model server also refuses a text of under three sentences, however many words it has. Saying "enter at
    least 60 words" to someone who typed 70 is wrong and baffling, so this case has its own message."""
    return AppError(
        code="TEXT_TOO_FEW_SENTENCES",
        message=f"Your text has {words} words but fewer than 3 sentences. Add a few more sentences, or break long ones up with full stops, for a reliable result.",
        status_code=422,
    )


def _is_configured() -> bool:
    s = get_settings()
    return all([s.checker_url, s.checker_token, s.cf_access_client_id, s.cf_access_client_secret])


def checker_configured() -> bool:
    """Public wrapper so other modules (health_service's /readiness) can tell "intentionally not
    set up here" (dev/test, expected) apart from "configured but unreachable" (a real outage)."""
    return _is_configured()


def _access_headers() -> dict[str, str]:
    s = get_settings()
    return {"CF-Access-Client-Id": s.cf_access_client_id, "CF-Access-Client-Secret": s.cf_access_client_secret}


def ping_checker() -> bool:
    """Health probe for the admin System page. Never raises."""
    if not _is_configured():
        return False
    s = get_settings()
    try:
        resp = httpx.get(f"{s.checker_url.rstrip('/')}/health", headers=_access_headers(), timeout=3.0)
        return resp.status_code == 200 and bool(resp.json().get("ok"))
    except Exception:
        return False


class _CircuitBreaker:
    """Opens after `threshold` consecutive failures; lets one trial request through per `cooldown` seconds."""

    def __init__(self, threshold: int = 3, cooldown: float = 30.0):
        self.threshold = threshold
        self.cooldown = cooldown
        self.failures = 0
        self.opened_at = 0.0

    def allow(self) -> bool:
        if self.failures < self.threshold:
            return True
        if time.monotonic() - self.opened_at >= self.cooldown:
            self.opened_at = time.monotonic()  # half-open: only one trial per cooldown
            return True
        return False

    def success(self) -> None:
        self.failures = 0

    def failure(self) -> None:
        self.failures += 1
        if self.failures >= self.threshold:
            self.opened_at = time.monotonic()


class CheckerService:
    def __init__(self, client: httpx.AsyncClient | None = None, breaker: _CircuitBreaker | None = None):
        self._client = client
        self._breaker = breaker or _CircuitBreaker()

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            s = get_settings()
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(s.checker_read_timeout_seconds, connect=s.checker_connect_timeout_seconds)
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def check_text(self, text: str) -> dict:
        stripped = _clean_text(text).strip()
        if not stripped:
            raise AppError(code="EMPTY_TEXT", message="Text must not be empty", status_code=400)

        max_chars = int(runtime_settings.get("checker_max_chars"))
        if len(stripped) > max_chars:
            raise AppError(
                code="TEXT_TOO_LONG",
                message=f"Text exceeds the {max_chars}-character limit",
                status_code=413,
            )

        minimum = get_settings().checker_min_words
        if len(_WORD_RE.findall(stripped)) < minimum:
            raise _too_short(minimum)

        return self._to_result(await self._score(stripped), minimum)

    async def _score(self, text: str) -> dict:
        if not _is_configured():
            logger.error("checker_not_configured")
            raise _unavailable()
        if not self._breaker.allow():
            raise _unavailable()

        s = get_settings()
        try:
            resp = await self._http().post(
                f"{s.checker_url.rstrip('/')}/score",
                json={"text": text},
                headers={**_access_headers(), "X-Checker-Token": s.checker_token},
            )
        except httpx.HTTPError as exc:
            # Not chained (`from None`): a transport error's message can contain a header value, and
            # error reports capture the chain.
            self._breaker.failure()
            logger.warning("checker_unreachable error=%s", type(exc).__name__)
            raise _unavailable() from None

        if resp.status_code == 413:
            raise AppError(code="TEXT_TOO_LONG", message="Text is too long for the AI checker", status_code=413)
        if resp.status_code != 200:
            self._breaker.failure()
            logger.warning("checker_bad_status status=%s", resp.status_code)
            raise _unavailable()
        try:
            payload = resp.json()
        except ValueError as exc:
            self._breaker.failure()
            logger.error("checker_non_json_response")
            raise _unavailable() from None
        self._breaker.success()
        return payload

    def _to_result(self, payload: dict, minimum: int) -> dict:
        try:
            if payload.get("verdict") == "insufficient_text":
                # The server reports the word count it saw. At or over the minimum, the words are not the problem.
                seen = payload.get("words")
                if isinstance(seen, int) and seen >= minimum:
                    raise _too_few_sentences(seen)
                raise _too_short(minimum)
            score = float(payload["score"])
            p = {k: float(payload["p"][k]) for k in ("human", "ai", "mixed")}
            mixed = p["mixed"]
            sentences = [
                {
                    "text": str(item["text"]),
                    "ai_score": None if item["p_ai"] is None else float(item["p_ai"]),
                }
                for item in payload["sentences"]
            ]
            words = int(payload["words"])
            new_rules = str(payload.get("model", "")).startswith(PV10_MODEL_PREFIX)
            if new_rules:
                level, lean = six_level(score, p, [item["ai_score"] for item in sentences])
                verdict = _LEGACY_VERDICT[level]
            else:
                level, lean = None, None
                verdict = _hold_back_unsupported_ai(_VERDICTS[payload["verdict"]], sentences)
        except AppError:
            raise
        except (KeyError, TypeError, ValueError) as exc:
            self._breaker.failure()
            logger.error("checker_malformed_response")
            raise _unavailable() from None

        cuts = (PV10_SENTENCE_HUMAN_MAX, PV10_SENTENCE_AI_MIN) if new_rules else (SENTENCE_HUMAN_MAX, SENTENCE_AI_MIN)
        return {
            "verdict": verdict,
            "level": level,
            "lean": lean,
            "ai_score": round(score, 4),
            "mixed_probability": round(mixed, 4),
            "word_count": words,
            "sentences": [{**item, "label": _sentence_label(item["ai_score"], *cuts)} for item in sentences],
            "disclaimer": DISCLAIMER_PV10 if new_rules else DISCLAIMER,
        }
