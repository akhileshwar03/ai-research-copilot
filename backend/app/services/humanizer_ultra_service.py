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
import time

import httpx

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.services.humanizer import chunking
from app.services.humanizer.entity_check import check_entity_invariant, strip_fabricated_lines, strip_junk_furniture
from app.services.humanizer.examples import format_examples
from app.services.runtime_settings import runtime_settings
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
#
# 2026-09-18: updated for the 7B -> 3B (humaniser-lora-3b-v2) switch -- measured directly
# against the live Ollama endpoint (3 trials: 9.89, 10.31, 9.97 tok/s), not estimated.
# Left on the old 4.3 value this constant would just throttle the faster model down to the
# 7B's conservative token ceiling instead of letting it use its real headroom -- verified
# this was happening (every chunk capped at num_predict=464) during the 600-word boundary
# test run before this fix. Kept intentionally conservative (10.0, not the measured ~10.1
# average) for the same margin-of-safety reasoning as the original 4.3 figure.
_MEASURED_GEN_TOKENS_PER_SECOND = 10.0
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


def _num_predict_for(
    chunk: str, timeout_seconds: float, tokens_per_second: float = _MEASURED_GEN_TOKENS_PER_SECOND
) -> int:
    """Token allowance for one chunk: enough for the expected rewrite, but never more
    than the per-request timeout can physically generate. `tokens_per_second` defaults
    to the local (Ollama) rate; the Modal path passes its own real measured rate --
    the two backends run on different hardware/serving stacks and sizing one path off
    the other's rate would either throttle Modal needlessly or risk timing out local."""
    budget_ceiling = max(256, int(timeout_seconds * tokens_per_second * _TIMEOUT_UTILISATION))
    wanted = chunking.word_count(chunk) * _TOKENS_PER_WORD_HEADROOM + 200
    wanted = max(_MIN_NUM_PREDICT, min(_MAX_NUM_PREDICT, wanted))
    # The time budget wins over the length estimate, always -- a truncated chunk is a bad
    # outcome, but a timeout loses the entire run and can't be retried into success.
    return min(wanted, budget_ceiling)


# 2026-09-19: single real measurement (warm request, L4 GPU, vLLM, this exact model) --
# 88 completion tokens in 2.7s = ~32.6 tok/s. Used at a conservative 25 tok/s here since
# this is one data point under zero concurrent load, not a proper benchmark, and per-
# request throughput will drop somewhat once multiple users are actually hitting the
# same container (that's the real concurrency test still to be run before trusting this
# further). Re-measure under real concurrent load and update this once that's done.
_MODAL_MEASURED_GEN_TOKENS_PER_SECOND = 25.0


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
# Bumped 2 -> 4 (2026-09-20): combined_validation_v3/v4/v5 runs all showed the same failure
# shape -- a chunk fails entity_clean on every one of its 2 resample attempts and ships with
# the fabrication intact. Real cases that exhausted the old budget and shipped anyway:
# "By Andrew Ziegler", "Los Angeles Planning Commissioner Kevin LaBranche", and
# "Amanda Kelsey Pause". Doubling the budget costs at most 2 more chunk round trips in the
# worst case (still bounded, still per-chunk not per-document).
_MAX_EXPANSION_RESAMPLES = 4  # bounds the added latency; a resample costs a full chunk round trip


class HumanizerUltraService:
    async def _generate_chunk(
        self, client: httpx.AsyncClient, settings, system: str, chunk: str, temperature: float = 1.0
    ) -> str:
        """Dispatches to whichever backend runtime_settings.humanizer_ultra_backend
        currently selects. The "off" case is checked once up front in generate(), not
        here -- by the time this runs, the backend is guaranteed to be "local" or
        "modal". `temperature` defaults to 1.0 (the long-proven value both Modelfiles
        were tuned against); a resample can pass a lower value -- see
        _generate_chunk_checked's cooling schedule."""
        backend = runtime_settings.get("humanizer_ultra_backend")
        if backend == "modal":
            return await self._generate_chunk_modal(client, settings, system, chunk, temperature)
        return await self._generate_chunk_local(client, settings, system, chunk, temperature)

    async def _generate_chunk_local(
        self, client: httpx.AsyncClient, settings, system: str, chunk: str, temperature: float = 1.0
    ) -> str:
        resp = await client.post(
            f"{settings.humanizer_ultra_ollama_url}/api/chat",
            json={
                "model": settings.humanizer_ultra_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": chunk},
                ],
                "stream": False,
                # temperature explicit (not left to the Modelfile's own baked-in default)
                # so a resample can ask for a more conservative sample -- see
                # _generate_chunk_checked's cooling schedule. 1.0 here matches that
                # Modelfile default exactly, so a first attempt (no resample yet)
                # behaves identically to before this parameter existed.
                "options": {
                    "num_predict": _num_predict_for(chunk, settings.humanizer_ultra_timeout_seconds),
                    "temperature": temperature,
                },
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

    async def _generate_chunk_modal(
        self, client: httpx.AsyncClient, settings, system: str, chunk: str, temperature: float = 1.0
    ) -> str:
        """scripts/finetune/serve_ultra_vllm.py, the Modal + vLLM deployment -- built
        for concurrent multi-user traffic (real researched numbers: ~10-20x Ollama's
        throughput under concurrent load), unlike the single-user local/Ollama path.

        Two real, verified auth layers (2026-09-19, checked against Modal's own docs
        before building this, not assumed): Modal's own proxy auth (Modal-Key/
        Modal-Secret headers) rejects an unauthenticated request at the edge before it
        can trigger a container cold start or count toward billing; vLLM's own
        --api-key (Authorization: Bearer) sits underneath as a second, cheap check.

        Sampling params (temperature/top_p/repetition_penalty) must be sent explicitly
        -- a real bug caught while building this: without them, vLLM's own defaults
        produced an output that was nearly a verbatim echo of the input, not a genuine
        rewrite. Values match the ones already proven in the local Ollama Modelfile
        (temperature 1.0, top_p 0.95, repeat_penalty 1.15), sent here as
        repetition_penalty -- vLLM's OpenAI-compatible name for the same parameter.

        A 503 here is not a failure -- per Modal's own docs, "no upstreams available"
        on a cold container is the documented signal that a cold start was just
        triggered, and the client is expected to retry. Real measured cold start for
        this exact deployment (2026-09-19): 92s. Retries with a short, fixed backoff
        until humanizer_ultra_modal_timeout_seconds is exhausted, rather than failing
        on the very first attempt the way a real error would."""
        deadline = time.monotonic() + settings.humanizer_ultra_modal_timeout_seconds
        headers = {
            "Modal-Key": settings.humanizer_ultra_modal_key,
            "Modal-Secret": settings.humanizer_ultra_modal_secret,
            "Authorization": f"Bearer {settings.humanizer_ultra_modal_api_key}",
        }
        payload = {
            "model": "humaniser-lora-3b",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": chunk},
            ],
            "max_tokens": _num_predict_for(
                chunk, settings.humanizer_ultra_modal_timeout_seconds, _MODAL_MEASURED_GEN_TOKENS_PER_SECOND
            ),
            "temperature": temperature,
            "top_p": 0.95,
            "repetition_penalty": 1.15,
        }
        resp = await client.post(f"{settings.humanizer_ultra_modal_url}/v1/chat/completions", headers=headers, json=payload)
        while resp.status_code == 503 and time.monotonic() < deadline:
            logger.info("humanizer_ultra_modal_cold_start_wait")
            await asyncio.sleep(5)
            resp = await client.post(f"{settings.humanizer_ultra_modal_url}/v1/chat/completions", headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        choices = data.get("choices") or []
        content = choices[0].get("message", {}).get("content", "") if choices else ""
        if not content:
            raise AppError(
                code="ULTRA_ERROR",
                message="Ultra Human mode failed to generate a response.",
                status_code=502,
            )
        content = _strip_html_artifacts(content)
        return _strip_scraped_credit_lines(content, chunk).strip()

    async def _generate_chunk_checked(
        self, client: httpx.AsyncClient, settings, system: str, chunk: str, expand: bool, budget: list[int]
    ) -> str:
        """One chunk, with a length-fidelity check and an entity/citation-invariant check.
        On expand=False a rewrite that balloons past _MAX_EXPANSION_RATIO isn't a rewrite
        any more, so resample once (if the shared budget allows) and keep whichever attempt
        lands closest to the source length. The two checks catch different failure shapes,
        confirmed empirically while validating the 3B follow-up LoRA (see
        app/services/humanizer/entity_check.py): expansion ratio and fabricated content are
        correlated but not the same signal -- a fabricated quote or byline can fit inside a
        modest, otherwise-unremarkable length increase that the ratio check alone would pass.
        Both checks share one resample budget so a pathological chunk can't cost more than
        _MAX_EXPANSION_RESAMPLES round trips total, same as before this check was added."""
        best = await self._generate_chunk(client, settings, system, chunk)

        # 2026-09-19: unconditional and independent of every other check here --
        # scraped website furniture ("Tags: Library", "Comments ()", a full blog
        # comment-form footer) asserts no fact at all, so check_entity_invariant
        # never sees anything to flag, and it's not a length problem either. Runs
        # before the expand short-circuit below since this junk is never
        # legitimate output in ANY mode, not just the strict rewrite path.
        furniture_stripped = strip_junk_furniture(best)
        if furniture_stripped["removed_lines"]:
            logger.warning(
                "humanizer_ultra_junk_furniture_stripped removed=%r", furniture_stripped["removed_lines"]
            )
            best = furniture_stripped["output"]

        if expand:
            return best  # elaboration is the explicitly requested behaviour here

        source_words = chunking.word_count(chunk)
        if not source_words:
            return best

        # 2026-09-20: real, confirmed production case -- a mindfulness essay about
        # houseplants came back as an unrelated first-person story about divorced
        # parents, on every one of 4 resamples, each inventing a DIFFERENT fake name
        # (so entity_check kept firing) but the SAME underlying hijacked narrative.
        # Every prior resample attempt in this loop was fired at the identical
        # temperature=1.0 that produced the problem in the first place -- nothing
        # about "try again" made the model any less likely to go off-topic again.
        # Cooling the temperature on each successive resample is a real, different
        # lever from everything tried earlier this session (all of which were
        # POST-HOC detectors: embedding/NLI similarity, an LLM judge, entity
        # regexes) -- this instead makes the generation itself more conservative
        # each time it's asked to try again, on the reasoning that high temperature
        # is what lets the model wander into inventing a scene at all. Shared
        # across both resample loops below (one running counter) so the schedule
        # keeps cooling across a chunk's *entire* retry sequence, not per-loop.
        resamples_used = 0

        def _cooled_temperature() -> float:
            return max(0.3, 1.0 - 0.2 * resamples_used)

        while chunking.word_count(best) > source_words * _MAX_EXPANSION_RATIO and budget[0] > 0:
            budget[0] -= 1
            resamples_used += 1
            logger.warning(
                "humanizer_ultra_runaway_expansion source_words=%d output_words=%d; resampling temperature=%.1f",
                source_words,
                chunking.word_count(best),
                _cooled_temperature(),
            )
            candidate = await self._generate_chunk(client, settings, system, chunk, _cooled_temperature())
            if abs(chunking.word_count(candidate) - source_words) < abs(chunking.word_count(best) - source_words):
                best = candidate

        if check_entity_invariant(chunk, best)["violation"]:
            # 2026-09-19: try a free, instant fix before spending any resample budget --
            # real fabrications caught this session (a byline, a photo credit) showed up
            # as their OWN standalone line, structurally separate from the rest of the
            # output. Deleting a whole line shaped like a removable tag costs nothing and
            # is guaranteed, unlike a resample, which costs a full extra generation round
            # trip and can still exhaust its budget without finding a clean candidate
            # (confirmed in real testing: a fabricated byline survived all 3 attempts on
            # one real input). Deliberately narrow -- see strip_fabricated_lines's own
            # docstring and _is_removable_line_shape for exactly which lines qualify;
            # anything woven into an ordinary sentence is left untouched and still falls
            # through to the resample loop below.
            stripped = strip_fabricated_lines(chunk, best)
            if stripped["removed_lines"]:
                logger.warning(
                    "humanizer_ultra_fabrication_line_stripped removed=%r", stripped["removed_lines"]
                )
                best = stripped["output"]

        while check_entity_invariant(chunk, best)["violation"] and budget[0] > 0:
            budget[0] -= 1
            resamples_used += 1
            new_entities = check_entity_invariant(chunk, best)["new_entities"]
            logger.warning(
                "humanizer_ultra_entity_fabrication new_entities=%r; resampling temperature=%.1f",
                new_entities,
                _cooled_temperature(),
            )
            candidate = await self._generate_chunk(client, settings, system, chunk, _cooled_temperature())
            if not check_entity_invariant(chunk, candidate)["violation"]:
                best = candidate  # prefer a clean candidate outright
            elif len(check_entity_invariant(chunk, candidate)["new_entities"]) < len(new_entities):
                best = candidate  # otherwise take whichever fabricates less

        final = check_entity_invariant(chunk, best)
        if final["violation"]:
            # 2026-09-20: real, confirmed production case -- a 152-word mindfulness
            # essay about houseplants came back as a ~370-word first-person story
            # about divorced parents and a dead pet, on EVERY one of 4 resamples
            # (different fake names each time, same hijacked narrative). The
            # expansion-ratio guard above missed it (2.46x, just under the 2.5x
            # trigger) because the fabrication wasn't primarily a length problem.
            # Previously this branch didn't exist -- exhausting the resample
            # budget just shipped whichever attempt fabricated least, which for
            # a genuinely stuck input is still a fabricated wholesale rewrite,
            # not a merely-imperfect one. That's the wrong tradeoff for a product
            # that promises meaning/facts are preserved: a loud, honest failure
            # here is strictly better than silently shipping an unrelated story.
            logger.warning(
                "humanizer_ultra_fabrication_unresolved new_entities=%r; refusing to ship",
                final["new_entities"],
            )
            raise AppError(
                code="ULTRA_FABRICATION_UNRESOLVED",
                message=(
                    "Ultra Human couldn't produce a faithful rewrite of this text after "
                    "several attempts — it kept introducing content not in the original. "
                    "Try again, or use the Basic tab instead."
                ),
                status_code=502,
            )
        return best

    async def generate(self, text: str, style: str = "normal", expand: bool = False) -> str:
        settings = get_settings()
        backend = runtime_settings.get("humanizer_ultra_backend")
        if backend == "off":
            raise AppError(
                code="ULTRA_DISABLED",
                message="Ultra Human mode is temporarily unavailable. Please try again later, or use the Basic tab.",
                status_code=503,
            )
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
                    f"{words:,}). It runs a dedicated fine-tuned model rather than a general-purpose "
                    "hosted API, so longer passages take more time than a single request can reasonably "
                    "hold — split the text and run it in parts, or use the Basic tab for the whole piece."
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

        # The two backends have different cold-start profiles (local Ollama's
        # measured ~113s cold vs Modal's measured ~92s cold, plus Modal's own
        # in-request retry loop above needs the surrounding client timeout to
        # actually outlast it), so each gets its own configured timeout rather
        # than sharing one value tuned for only one of them.
        client_timeout = (
            settings.humanizer_ultra_modal_timeout_seconds
            if backend == "modal"
            else settings.humanizer_ultra_timeout_seconds
        )
        outputs: list[tuple[str, str]] = []
        # Shared across chunks (mutable so _generate_chunk_checked can decrement it) so one
        # pathological input can't turn a 6-chunk request into 18 round trips.
        resample_budget = [_MAX_EXPANSION_RESAMPLES]
        try:
            async with httpx.AsyncClient(timeout=client_timeout) as client:
                for chunk, separator in chunks:
                    text_out = await self._generate_chunk_checked(
                        client, settings, system, chunk, expand, resample_budget
                    )
                    outputs.append((text_out, separator))
        except httpx.ConnectError as exc:
            logger.warning("humanizer_ultra_unreachable: %s", exc)
            where = "the locally-hosted fine-tuned model" if backend == "local" else "the hosted fine-tuned model"
            raise AppError(
                code="ULTRA_UNAVAILABLE",
                message=f"Ultra Human mode isn't available right now — it runs on {where}, which isn't reachable in this environment.",
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
