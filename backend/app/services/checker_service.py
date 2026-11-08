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

# The sentence head is a two-class classifier; 0.5 is its default decision point (not separately calibrated).
SENTENCE_FLAG_THRESHOLD = 0.5

_VERDICTS = {"human": "likely_human", "unsure": "uncertain", "ai": "likely_ai"}
_WORD_RE = re.compile(r"[A-Za-z0-9']+")


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


def _is_configured() -> bool:
    s = get_settings()
    return all([s.checker_url, s.checker_token, s.cf_access_client_id, s.cf_access_client_secret])


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
        stripped = text.strip()
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
            self._breaker.failure()
            logger.warning("checker_unreachable error=%s", type(exc).__name__)
            raise _unavailable() from exc

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
            raise _unavailable() from exc
        self._breaker.success()
        return payload

    def _to_result(self, payload: dict, minimum: int) -> dict:
        try:
            if payload.get("verdict") == "insufficient_text":
                raise _too_short(minimum)
            verdict = _VERDICTS[payload["verdict"]]
            score = float(payload["score"])
            mixed = float(payload["p"]["mixed"])
            sentences = [
                {
                    "text": str(item["text"]),
                    "ai_score": None if item["p_ai"] is None else float(item["p_ai"]),
                }
                for item in payload["sentences"]
            ]
            words = int(payload["words"])
        except AppError:
            raise
        except (KeyError, TypeError, ValueError) as exc:
            self._breaker.failure()
            logger.error("checker_malformed_response")
            raise _unavailable() from exc

        return {
            "verdict": verdict,
            "ai_score": round(score, 4),
            "mixed_probability": round(mixed, 4),
            "word_count": words,
            "sentences": [
                {**item, "flagged": item["ai_score"] is not None and item["ai_score"] >= SENTENCE_FLAG_THRESHOLD}
                for item in sentences
            ],
            "disclaimer": DISCLAIMER,
        }
