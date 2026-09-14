"""'Ultra Human' — real output from the Phase 2 fine-tuned LoRA (Qwen2.5-7B +
adapter, 80% real GPTZero pass rate, backend/scripts/finetune/STATE.md Round 23),
served locally via Ollama. Not production-hosted (the Modal integration hasn't
been built yet) -- reachable only when a local Ollama instance with
`humaniser-lora` loaded is running. Everywhere else this raises a clear
AppError the route/frontend can present as "unavailable" rather than a bare
500 or an indefinite hang.

System prompt construction mirrors export.py (BASE_PROMPT + hard_rules +
STYLE_GUIDANCE + few-shot examples) -- that is the prompt the model was actually
trained on, so using anything else here would be testing it out of distribution.
Note this deliberately does NOT mirror pipeline.py any more: since 2026-08-12 the
Basic path's normal/non-expand route uses AGGRESSIVE_REWRITE_PROMPT instead, which
the LoRA never saw in training. Ultra staying on the training-time prompt is the
correct choice, not drift.

Known, deliberate exception: `expand=True` feeds EXPANDED_HARD_RULES, which
export.py never emitted -- every training row used STRICT_HARD_RULES. That path is
genuinely out of distribution for this model. It's kept because the UI checkbox is
the user's explicit opt-in and silently ignoring it would be worse, but Ultra's
elaboration mode has no training-time backing and shouldn't be assumed to behave
like the Basic path's.
"""

import asyncio
import html
import logging
import re

import httpx

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.services.humanizer import chunking
from app.services.humanizer.examples import format_examples
from app.services.humanizer.prompts import (
    BASE_PROMPT,
    DEFAULT_STYLE,
    EXPANDED_HARD_RULES,
    STRICT_HARD_RULES,
    STYLE_GUIDANCE,
)

logger = logging.getLogger(__name__)

# 2026-08-13: found live (real user screenshot, reproduced 2/3 trials against the raw
# Ollama endpoint with fresh, unrelated inputs) -- the fine-tuned LoRA occasionally emits
# literal HTML tags (`<i>...</i>`, `<p>`) around quoted or emphasized phrases instead of
# plain quotation marks, most often on inputs with lists/code-like paths/nested quotes.
# Not documented in scripts/finetune/STATE.md's existing data-cleaning notes, which cover
# HTML *entities* (`&amp;`) but not literal tags -- this is a separate, previously-unknown
# training-data artifact, most likely raw HTML that leaked into the AI-ify/collection corpus
# and got learned as if it were normal punctuation. The real fix is re-auditing and
# re-cleaning that corpus before any future retrain (out of scope here). This is a
# symptom-level guard so the live UI never shows raw tag characters in the meantime --
# strips common inline HTML tags and unescapes any HTML entities that slip through too.
_HTML_TAG_RE = re.compile(r"</?(?:i|b|em|strong|p|br|span|div|u)\s*/?>", re.IGNORECASE)

# 2026-08-13: second output artifact from the same LoRA, seen in a live 322-word run --
# it intermittently drops the space after a sentence-ending period ("software
# licenses.Salesforce reported...", "with mixed early results.None of this settles it").
# Same class of training-corpus contamination as the HTML tags above, and just as visible
# to the end user. Deliberately conservative: it fires only on two-or-more lowercase
# letters, then .!?, then an uppercase letter. That guard is what keeps it off initials
# and abbreviations ("U.S.A.", "e.g.Foo") -- both have a single character or an uppercase
# one before the period, so neither matches. Domains are safe too, since "example.com" is
# followed by lowercase. This can't reach inside a markdown link target, which always has
# a "/" or lowercase after the dot.
_MISSING_SENTENCE_SPACE_RE = re.compile(r"([a-z]{2,}[)\]\"']*[.!?])([A-Z])")


# 2026-08-13, third artifact from the same corpus, and the most damaging one yet. A cold
# 140-word run about bees came back with this interleaved through the output three times:
#
#     Bee | Credits:
#     CC-BY-2.0 image from freeimagearchive.com
#
# Nothing remotely like it was in the input. It is scraped article furniture -- image
# captions and licence lines from the pages the fine-tuning corpus was collected from --
# learned as if it were prose. Same root cause as the HTML tags and the dropped spaces
# above, and the same real fix: re-audit and re-clean that corpus before any retrain
# (STATE.md, out of scope here).
#
# The guard is narrow on purpose. It only drops a line when BOTH hold: the line looks like
# caption/licence furniture, AND nothing resembling it appears in the source. That second
# condition is what makes this safe for someone legitimately writing about image licensing
# -- their own text keeps its credit lines, because those are in the source.
_CREDIT_LINE_RE = re.compile(
    r"^\s*(?:"
    r".{0,60}\|\s*Credits?\s*:?"  # "Bee | Credits:"
    r"|(?:CC[\s-]?BY|CC0)[\w.\s-]*image\s+from\b.*"  # "CC-BY-2.0 image from foo.com"
    r"|(?:Image|Photo|Picture|Illustration)\s+(?:credit|courtesy|source|by)\b.*"
    r"|Credits?\s*:\s*.{0,80}"
    r")\s*$",
    re.IGNORECASE,
)
_CREDIT_HINT_RE = re.compile(r"credit|cc[\s-]?by|cc0|courtesy|wikipedia|read more|further reading", re.IGNORECASE)

# The same furniture also shows up mid-text rather than on its own line. A live browser run
# on the bee text returned a chunk that opened "See Wikipedia: Bee Despite being individual
# insects..." -- a scraped cross-reference welded onto the front of real content, so
# dropping the whole line would take the sentence with it. Only the reference prefix goes.
_REFERENCE_PREFIX_RE = re.compile(
    r"^\s*(?:See(?:\s+also)?\s+Wikipedia\s*:\s*\S+|Read\s+more\s*:.*?|Further\s+reading\s*:.*?|Source\s*:\s*\S+)\s+",
    re.IGNORECASE,
)


def _strip_scraped_credit_lines(text: str, source: str) -> str:
    if not _CREDIT_HINT_RE.search(text):
        return text
    # If the source itself talks about credits, licensing, or references, leave the output
    # alone entirely rather than risk eating the user's own content.
    if _CREDIT_HINT_RE.search(source):
        return text

    kept = []
    for line in text.split("\n"):
        if _CREDIT_LINE_RE.match(line):
            continue
        kept.append(_REFERENCE_PREFIX_RE.sub("", line))
    cleaned = "\n".join(kept)
    # Collapse the blank-line runs that removing whole lines leaves behind.
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def _strip_html_artifacts(text: str) -> str:
    cleaned = _HTML_TAG_RE.sub("", text)
    cleaned = html.unescape(cleaned)
    cleaned = _MISSING_SENTENCE_SPACE_RE.sub(r"\1 \2", cleaned)
    return cleaned


def _resolve_style(style: str) -> str:
    return style if style in STYLE_GUIDANCE else DEFAULT_STYLE


def _build_system_prompt(style: str, expand: bool) -> str:
    hard_rules = EXPANDED_HARD_RULES if expand else STRICT_HARD_RULES
    resolved = _resolve_style(style)
    parts = [BASE_PROMPT, hard_rules, STYLE_GUIDANCE[resolved], format_examples(resolved)]
    return "\n\n".join(p for p in parts if p)


# 2026-08-13, measured directly against the live Ollama endpoint (not estimated) --
# generation runs a steady 4.3-4.4 tok/s on this box and prompt eval is negligible
# (~1,600-1,800 prompt tokens in 2-4s). Two real trials: 83 input words -> 169 tokens
# in 41s; 227 input words -> 458 tokens in 110s. That works out to roughly half a
# second of wall clock per input word, and it is why the single-shot version of this
# method was broken for anything real: a 936-word input (well inside the 3,000-word
# limit the UI advertises) hit the 180s timeout every time and could never succeed on
# retry, because the work genuinely exceeds the budget in one request. The flat
# num_predict=1200 ceiling was a second, quieter truncation cliff on top of that.
#
# Fix is the same one the Basic pipeline already uses: split on paragraph boundaries
# and send one request per chunk, each comfortably inside the per-request timeout, so
# nothing is truncated and nothing times out. Chunks run sequentially on purpose --
# local Ollama serializes on one GPU anyway, so firing them concurrently would only
# contend for the same resource and risk tripping every chunk's timeout at once
# instead of one.
ULTRA_CHUNK_TARGET_WORDS = 100

# 2026-08-13, second round: a real user report (153-word input, timed out twice) exposed a
# bug in the first round's sizing. num_predict was derived purely from expected output
# length and never checked against the time budget, so the two could contradict each other:
# a ~140-word chunk was allotted num_predict=760, and 760 tokens at the measured 4.3 tok/s
# is 177 seconds of generation against a 180-second per-request timeout. Any chunk where
# the model didn't stop early on its own simply ran out the clock. "Generous headroom" is
# only free when something else bounds the wall clock -- here nothing did.
#
# So the ceiling is now DERIVED from the timeout instead of guessed independently. Whatever
# humanizer_ultra_timeout_seconds is set to, a single request can never be allowed to ask
# for more tokens than that timeout can actually deliver.
_MEASURED_GEN_TOKENS_PER_SECOND = 4.3
# Fraction of the timeout generation may consume; the rest absorbs prompt eval (~2-4s),
# model load on a cold start (measured: a cold run took 113.6s vs 78.2s warm for the same
# input), and ordinary variance.
_TIMEOUT_UTILISATION = 0.6

# Re-measured the same day, and higher than the first round assumed: 138 words in produced
# 225 and 274 words out across two trials, i.e. output runs about 2x the input in WORDS
# (~2.7 tokens per input word), not 2 tokens per input word.
_TOKENS_PER_WORD_HEADROOM = 4
_MIN_NUM_PREDICT = 512
_MAX_NUM_PREDICT = 2048


def _num_predict_for(chunk: str, timeout_seconds: float) -> int:
    """Token allowance for one chunk: enough for the expected rewrite, but never more
    than the per-request timeout can physically generate."""
    budget_ceiling = max(256, int(timeout_seconds * _MEASURED_GEN_TOKENS_PER_SECOND * _TIMEOUT_UTILISATION))
    wanted = chunking.word_count(chunk) * _TOKENS_PER_WORD_HEADROOM + 200
    wanted = max(_MIN_NUM_PREDICT, min(_MAX_NUM_PREDICT, wanted))
    # The time budget wins over the length estimate, always -- a truncated chunk is a bad
    # outcome, but a timeout loses the entire run and can't be retried into success.
    return min(wanted, budget_ceiling)


# 2026-08-13: the LoRA intermittently abandons rewriting and starts WRITING A NEW ARTICLE.
# Reproduced back to back on identical 140-word input about bees: one run returned a clean
# 159-word rewrite, the next returned 507 words (3.6x) of invented material -- section
# headings the source never had, a fabricated "European Food Safety Agency (EFSA)" citation,
# named viruses and parasites found nowhere in the input -- and then ran into the token
# ceiling mid-sentence. This is the fidelity failure STATE.md Round 22 records as "much
# improved, not perfect"; it is more severe than that phrasing suggests, and it is a
# training-data problem no service-layer change can truly fix.
#
# What the service layer CAN do is refuse to ship the obvious cases. With expand=False the
# product promises, in the UI footer the user is looking at, that meaning and facts are
# preserved and only phrasing changes. A 3.6x expansion is definitionally not that. Runaway
# output is also strongly bimodal rather than a slow drift -- the good run was 1.1x and the
# bad one 3.6x -- so a ratio test separates them cleanly, and one resample usually lands
# back in the good mode.
_MAX_EXPANSION_RATIO = 2.5
_MAX_EXPANSION_RESAMPLES = 2  # bounds the added latency; a resample costs a full chunk round trip


class HumanizerUltraService:
    async def _generate_chunk(self, client: httpx.AsyncClient, settings, system: str, chunk: str) -> str:
        resp = await client.post(
            f"{settings.humanizer_ultra_ollama_url}/api/chat",
            json={
                "model": settings.humanizer_ultra_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": chunk},
                ],
                "stream": False,
                "options": {"num_predict": _num_predict_for(chunk, settings.humanizer_ultra_timeout_seconds)},
            },
        )
        resp.raise_for_status()
        data = resp.json()
        # Ollama can answer 200 with an `error` field rather than a message on some
        # failure modes; treat that as a real failure instead of silently returning "".
        if isinstance(data.get("error"), str) and data["error"]:
            raise AppError(
                code="ULTRA_ERROR",
                message="Ultra Human mode failed to generate a response.",
                status_code=502,
            )
        content = _strip_html_artifacts(data.get("message", {}).get("content", ""))
        return _strip_scraped_credit_lines(content, chunk).strip()

    async def _generate_chunk_checked(
        self, client: httpx.AsyncClient, settings, system: str, chunk: str, expand: bool, budget: list[int]
    ) -> str:
        """One chunk, with a length-fidelity check. On expand=False a rewrite that balloons
        past _MAX_EXPANSION_RATIO isn't a rewrite any more, so resample once (if the shared
        budget allows) and keep whichever attempt lands closest to the source length."""
        best = await self._generate_chunk(client, settings, system, chunk)
        if expand:
            return best  # elaboration is the explicitly requested behaviour here

        source_words = chunking.word_count(chunk)
        if not source_words:
            return best

        while chunking.word_count(best) > source_words * _MAX_EXPANSION_RATIO and budget[0] > 0:
            budget[0] -= 1
            logger.warning(
                "humanizer_ultra_runaway_expansion source_words=%d output_words=%d; resampling",
                source_words,
                chunking.word_count(best),
            )
            candidate = await self._generate_chunk(client, settings, system, chunk)
            if abs(chunking.word_count(candidate) - source_words) < abs(chunking.word_count(best) - source_words):
                best = candidate
        return best

    async def generate(self, text: str, style: str = "normal", expand: bool = False) -> str:
        settings = get_settings()
        system = _build_system_prompt(style, expand)

        # Ultra's real ceiling is wall clock, not the shared humanize_max_words limit.
        # At the measured ~0.5s/word, the Basic path's 3,000-word allowance would mean a
        # ~25-minute HTTP request. Refusing up front with an honest number beats letting
        # someone wait out a request that was never going to finish.
        words = chunking.word_count(text)
        max_words = settings.humanizer_ultra_max_words
        if words > max_words:
            raise AppError(
                code="ULTRA_TEXT_TOO_LONG",
                message=(
                    f"Ultra Human mode handles up to {max_words:,} words at a time (this is "
                    f"{words:,}). It runs a full 7B model locally rather than a hosted API, so "
                    "longer passages take more time than a single request can reasonably hold — "
                    "split the text and run it in parts, or use the Basic tab for the whole piece."
                ),
                status_code=413,
            )

        # chunk_with_separators, not chunk_text: it splits inside an over-long paragraph
        # too. Paragraph-only chunking did nothing at all for single-paragraph input --
        # the shape someone gets from pasting an essay -- so a 494-word one-paragraph
        # request still went out whole and still timed out. See chunking.py.
        chunks = (
            chunking.chunk_with_separators(text, ULTRA_CHUNK_TARGET_WORDS)
            if words > ULTRA_CHUNK_TARGET_WORDS
            else [(text, "")]
        )

        outputs: list[tuple[str, str]] = []
        # Shared across chunks (mutable so _generate_chunk_checked can decrement it) so one
        # pathological input can't turn a 6-chunk request into 18 round trips.
        resample_budget = [_MAX_EXPANSION_RESAMPLES]
        try:
            async with httpx.AsyncClient(timeout=settings.humanizer_ultra_timeout_seconds) as client:
                for chunk, separator in chunks:
                    text_out = await self._generate_chunk_checked(
                        client, settings, system, chunk, expand, resample_budget
                    )
                    outputs.append((text_out, separator))
        except httpx.ConnectError as exc:
            logger.warning("humanizer_ultra_unreachable: %s", exc)
            raise AppError(
                code="ULTRA_UNAVAILABLE",
                message=(
                    "Ultra Human mode isn't available right now — it runs on the locally-hosted "
                    "fine-tuned model, which isn't reachable in this environment."
                ),
                status_code=503,
            ) from exc
        except httpx.TimeoutException as exc:
            logger.warning("humanizer_ultra_timeout: %s", exc)
            raise AppError(
                code="ULTRA_TIMEOUT",
                message="Ultra Human mode timed out — the model may be waking up from idle. Try again shortly.",
                status_code=504,
            ) from exc
        except httpx.HTTPStatusError as exc:
            logger.exception("humanizer_ultra_http_error")
            raise AppError(
                code="ULTRA_ERROR",
                message="Ultra Human mode failed to generate a response.",
                status_code=502,
            ) from exc
        except httpx.RequestError as exc:
            # Backstop for the rest of the transport family (ReadError, RemoteProtocolError,
            # ProtocolError...). Without this they escaped as a bare 500 with no usable message.
            logger.exception("humanizer_ultra_transport_error")
            raise AppError(
                code="ULTRA_UNAVAILABLE",
                message="Lost the connection to the local fine-tuned model. Try again shortly.",
                status_code=503,
            ) from exc
        except asyncio.CancelledError:
            raise

        # Rejoin with each chunk's own recorded separator, so a paragraph that had to be
        # split mid-way comes back as one paragraph rather than several.
        result = ""
        for part, separator in outputs:
            if not part:
                continue
            result = part if not result else result + separator + part
        result = result.strip()
        if not result:
            # Previously returned "" with a 200, which the frontend rendered as a
            # successful run showing an empty result panel.
            logger.warning("humanizer_ultra_empty_response chunks=%d", len(chunks))
            raise AppError(
                code="ULTRA_EMPTY",
                message="Ultra Human mode returned an empty result. Try again, or use the Basic tab.",
                status_code=502,
            )
        return result
