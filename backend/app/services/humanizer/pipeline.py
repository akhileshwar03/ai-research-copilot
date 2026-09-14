"""Three-pass Humaniser pipeline: analyze (Pass 1) -> rewrite (Pass 2,
streamed) -> verify + selective retry (Pass 3).

Maps onto the frontend's existing "reading -> writing -> done" phases:
Pass 1 runs during "reading", Pass 2 streams during "writing", and Pass 3
runs in the gap just before "done" — if it patches a paragraph, `run()`
yields one `revised` event carrying the full corrected text, which the
route turns into a `revised` SSE frame the client swaps in before marking
the run complete. Everything else about the token stream is unchanged.
"""

import asyncio
import logging
import re
import statistics

from app.services.humanizer import chunking, detector, examples as examples_module, prompts, style_check

logger = logging.getLogger(__name__)

MAX_RETRY_PARAGRAPHS = 8  # sane ceiling so one pathological verify pass can't fire off dozens of retry calls

_WORD_SPLIT_RE = re.compile(r"\S+\s*")


def _sentence_word_counts(text: str) -> list[int]:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return [len(s.split()) for s in sentences if s.strip()]


# Burstiness is an unbounded standard deviation (real paragraphs land anywhere from
# ~2 to ~20), while a banned-vocabulary hit used to cost a flat 3. That made the two
# terms incomparable in exactly the wrong direction: a candidate carrying three or four
# banned AI words could out-score a clean sibling purely on a few points of length
# variance, even though "zero banned vocabulary" is a hard rule in every prompt and
# burstiness is only a preference. These two constants restore the intended ordering --
# any banned hit at all now outweighs the entire achievable burstiness range, so
# burstiness does what it should: break ties between candidates that are all clean.
_BANNED_HIT_PENALTY = 25.0
_MAX_BURSTINESS_CREDIT = 20.0


def _ai_likelihood_score(text: str) -> float:
    """Free, local, zero-API-cost heuristic used ONLY to rank same-source
    rewrite candidates against each other (best-of-N) -- it is NOT a real
    detector and isn't claimed to be one. Encodes exactly the two signals
    the prompts' hard rules already target: banned AI vocabulary (should be
    zero) and sentence-length burstiness (real writing swings length
    sentence-to-sentence; flat, uniform lengths are the machine-like tell).
    Lower score = more human-like = better candidate.

    Scores against ALL_BANNED_VOCABULARY, not just BANNED_VOCABULARY: the
    prompt actually in force for every request the UI can make is the
    aggressive one, which bans a different set (see prompts.py)."""
    if not text:
        # Empty/None candidates are worst-possible rather than an AttributeError --
        # min() used to crash here when every candidate came back blank.
        return float("inf")
    lower = text.lower()
    banned_hits = sum(lower.count(phrase) for phrase in prompts.ALL_BANNED_VOCABULARY)
    lengths = _sentence_word_counts(text)
    burstiness = statistics.pstdev(lengths) if len(lengths) >= 2 else 0.0
    return banned_hits * _BANNED_HIT_PENALTY - min(burstiness, _MAX_BURSTINESS_CREDIT)


def _resolve_style(style: str) -> str:
    return style if style in prompts.STYLE_GUIDANCE else prompts.DEFAULT_STYLE


def _use_aggressive_prompt(style: str, expand: bool) -> bool:
    """2026-08-12: the aggressive prompt is self-contained (its own persona, its own hard
    rules) and was only real-world validated in strict, "normal"-style conditions -- 8
    trials on ZeroGPT, avg ~15% AI vs. the ~100% every other strategy scored that same day.
    expand mode and the other (currently unused in the UI) styles haven't been tested against
    it, so they still get the old modular BASE_PROMPT/hard_rules/guidance system rather than
    silently inheriting an unverified combination."""
    return not expand and _resolve_style(style) == "normal"


def _register_directive(register: str) -> str:
    """2026-09-13, Round 34: tells the rewrite model which of AGGRESSIVE_REWRITE_PROMPT's
    two register profiles applies, computed once up front by detector.classify_register
    rather than left for the rewrite model to self-classify mid-rewrite. Asking it to do
    both at once (classify AND override the source's often-already-formal surface tone)
    was tested twice for real and failed both times -- see STATE.md Round 34."""
    label = "CASUAL" if register == "casual" else "FORMAL"
    return (
        f"REGISTER FOR THIS TEXT: {label}. This has already been determined from the actual "
        f"content type, not guessed from the source's current wording — use the {label} profile "
        "from the rules above for every judgment call (contractions, sentence-length skew, "
        "connectors, direct address), even if the source text you're given currently reads in "
        "a different tone. Do not re-classify this yourself."
    )


def _build_rewrite_prompt(
    style: str, expand: bool, findings_text: str = "", voice: str = "", register: str = "casual"
) -> str:
    if _use_aggressive_prompt(style, expand):
        parts = [prompts.AGGRESSIVE_REWRITE_PROMPT, _register_directive(register)]
        if findings_text:
            parts.append(findings_text)
        if voice:
            parts.append(
                f'Match the voice and tone established earlier in this same document: "{voice}"'
            )
        return "\n\n".join(p for p in parts if p)

    hard_rules = prompts.EXPANDED_HARD_RULES if expand else prompts.STRICT_HARD_RULES
    guidance = prompts.STYLE_GUIDANCE[_resolve_style(style)]
    parts = [prompts.BASE_PROMPT, hard_rules, guidance, examples_module.format_examples(_resolve_style(style))]
    if findings_text:
        parts.append(findings_text)
    if voice:
        parts.append(
            f'Match the voice and tone established earlier in this same document: "{voice}"'
        )
    return "\n\n".join(p for p in parts if p)


def _build_retry_prompt(style: str, expand: bool, issues_text: str, register: str = "casual") -> str:
    if _use_aggressive_prompt(style, expand):
        parts = [prompts.AGGRESSIVE_REWRITE_PROMPT, _register_directive(register)]
        if issues_text:
            parts.append(issues_text)
        parts.append("Rewrite ONLY this paragraph in isolation. Return just the corrected paragraph text.")
        return "\n\n".join(parts)

    hard_rules = prompts.EXPANDED_HARD_RULES if expand else prompts.STRICT_HARD_RULES
    guidance = prompts.STYLE_GUIDANCE[_resolve_style(style)]
    parts = [prompts.BASE_PROMPT, hard_rules, guidance]
    if issues_text:
        parts.append(issues_text)
    parts.append("Rewrite ONLY this paragraph in isolation. Return just the corrected paragraph text.")
    return "\n\n".join(parts)


async def _retry_paragraph(
    ai_service,
    style: str,
    expand: bool,
    findings: list[dict],
    idx: int,
    paragraph_text: str,
    register: str = "casual",
) -> tuple[int, str | None]:
    """One Pass-3 retry call for a single flagged paragraph. Isolated per-paragraph
    error handling preserved exactly as before (a failed retry just leaves that
    paragraph unpatched) — only the caller now runs these concurrently instead of
    one at a time."""
    issues = [f for f in findings if f.get("paragraph") == idx]
    retry_prompt = _build_retry_prompt(style, expand, detector.findings_summary(issues), register)
    try:
        revised = await ai_service.rewrite_humanize_once([("system", retry_prompt), ("human", paragraph_text)])
    except Exception:
        logger.exception("humanizer_retry_failed paragraph=%d", idx)
        return idx, None
    revised = (revised or "").strip()
    return idx, (revised or None)


async def _verify_and_patch(
    ai_service, full_text: str, style: str, expand: bool, register: str = "casual"
) -> str | None:
    """Pass 3. Returns the corrected full text if at least one paragraph was
    patched, or None if verification found nothing worth a retry (or the
    retry made no usable change).

    2026-09-13, Round 34: findings now come from TWO sources, merged — the existing
    LLM-based detector.verify() (qualitative AI-tell patterns) plus
    style_check.deterministic_findings() (sentence-length variance and, in the casual
    register, contraction rate — checked with plain code, not asked of the model, because
    both were tested as prompt-only instructions and both failed to reliably land; see
    STATE.md Round 34 and style_check.py's module docstring). Both feed the same
    per-paragraph retry mechanism unchanged."""
    llm_findings = await detector.verify(ai_service, full_text)
    paragraphs = chunking.split_into_paragraphs(full_text)
    style_findings = style_check.deterministic_findings(paragraphs, register)
    findings = llm_findings + style_findings

    flagged = sorted(detector.flagged_paragraphs(findings))[:MAX_RETRY_PARAGRAPHS]
    if not flagged:
        return None

    valid_flagged = [idx for idx in flagged if 0 <= idx < len(paragraphs)]
    if not valid_flagged:
        return None

    # Retries are independent (different paragraph, own prompt, own text) -- run
    # them concurrently rather than one at a time. Confirmed the hard way: on any
    # input with multiple flagged paragraphs, this sequential loop was the single
    # largest contributor to real end-to-end latency, since each retry is a full
    # separate API round-trip. Same calls, same prompts, same per-paragraph error
    # handling -- only the wall-clock ordering changed.
    results = await asyncio.gather(
        *[
            _retry_paragraph(ai_service, style, expand, findings, idx, paragraphs[idx], register)
            for idx in valid_flagged
        ]
    )

    changed = False
    for idx, revised in results:
        if revised:
            paragraphs[idx] = revised
            changed = True

    return "\n\n".join(paragraphs) if changed else None


async def _generate_chunk(ai_service, messages: list[tuple[str, str]], num_candidates: int):
    """Yields {"type": "token", ...} events for one chunk's rewrite, then a
    final {"type": "_chunk_result", "text": str} with the chosen text.

    num_candidates <= 1: unchanged original behavior -- single real streamed
    call, tokens forwarded live as they arrive.

    num_candidates > 1: best-of-N, NOT sequential re-humanizing. All N
    candidates are generated independently and in parallel from the SAME
    source chunk (so none of them can drift from the original meaning by
    rewriting an already-rewritten text), scored with the free local
    heuristic above, and the best-scoring one wins. Since we only know the
    winner after all N finish, there's no real token-by-token stream to
    forward -- instead the winning text is chunked word-by-word and yielded
    as token events so the frontend's live-writing UI still animates it in,
    just compressed into the moment the winner is picked rather than
    trickling in from the model itself.
    """
    if num_candidates <= 1:
        chunk_output = ""
        async for token in ai_service.stream_humanize_rewrite(messages):
            chunk_output += token
            yield {"type": "token", "text": token}
        yield {"type": "_chunk_result", "text": chunk_output}
        return

    # return_exceptions=True matters more here than anywhere else in the pipeline.
    # Without it, ONE failed candidate call -- a transient 500, a rate limit, a dropped
    # connection -- propagated out of gather(), out of the pipeline generator, and the
    # route turned it into an `event: error` frame that threw away the whole run. The
    # user lost their entire rewrite because 1 of 3 redundant calls failed, and best-of-N
    # made that roughly three times likelier than a single call, not less. Best-of-N is
    # redundancy; a partial result is the whole point, so surviving candidates now win.
    results = await asyncio.gather(
        *[ai_service.rewrite_humanize_once(messages) for _ in range(num_candidates)],
        return_exceptions=True,
    )
    failures = [r for r in results if isinstance(r, BaseException)]
    if failures:
        logger.warning(
            "humanizer_candidate_failed failed=%d of=%d first=%r", len(failures), num_candidates, failures[0]
        )
    candidates = [r for r in results if isinstance(r, str) and r.strip()]
    if not candidates:
        # Every candidate failed or came back blank. Fall back to a single streamed call
        # rather than yielding an empty chunk -- one real attempt beats silently dropping
        # this chunk's text out of the final document.
        logger.warning("humanizer_all_candidates_failed n=%d; falling back to single streamed call", num_candidates)
        chunk_output = ""
        async for token in ai_service.stream_humanize_rewrite(messages):
            chunk_output += token
            yield {"type": "token", "text": token}
        yield {"type": "_chunk_result", "text": chunk_output}
        return

    winner = min(candidates, key=_ai_likelihood_score)

    for piece in _WORD_SPLIT_RE.findall(winner):
        yield {"type": "token", "text": piece}
    yield {"type": "_chunk_result", "text": winner}


async def run(ai_service, text: str, style: str = "normal", expand: bool = False):
    """Yields {"type": "token", "text": str} for each streamed rewrite token,
    then at most one {"type": "revised", "text": str} if Pass 3 patched a
    paragraph.

    Each chunk's rewrite is generated as `humanizer_num_candidates`
    independent best-of-N candidates from the ORIGINAL text (not chained on
    each other -- see _generate_chunk) and the most human-scoring one is
    kept. This replaced an earlier sequential "humanize the output, then
    humanize that 4-5 times" design: that approach risked compounding drift
    away from the source with every extra hop and, worse, never actually
    addressed the real problem -- a single pass was already inconsistent
    (verified against our own AI Checker: the exact same input scored
    anywhere from 69% to 97% AI probability run to run, purely from sampling
    randomness). Best-of-N fixes the actual inconsistency directly, at the
    source, without the drift risk.
    """
    style = _resolve_style(style)
    settings = getattr(ai_service, "settings", None)
    num_candidates = max(1, int(getattr(settings, "humanizer_num_candidates", 1)))

    # 2026-09-13, Round 34: classified ONCE from the ORIGINAL full text, before chunking or
    # rewriting -- not per chunk. A single document should read in one consistent register
    # throughout; classifying per chunk risked a multi-chunk document flipping register
    # partway through. Only spent on the aggressive-prompt path (_use_aggressive_prompt) --
    # the modular STYLE_GUIDANCE path has no register concept, so this would be a wasted
    # extra API call for every request that doesn't use it.
    register = "casual"
    if _use_aggressive_prompt(style, expand):
        register = await detector.classify_register(ai_service, text)

    chunks = chunking.chunk_text(text) if chunking.needs_chunking(text) else [text]

    rewritten_chunks: list[str] = []
    voice = ""

    for i, chunk in enumerate(chunks):
        findings = await detector.analyze(ai_service, chunk)
        findings_text = detector.findings_summary(findings)
        system_prompt = _build_rewrite_prompt(style, expand, findings_text, voice, register)
        messages = [("system", system_prompt), ("human", chunk)]

        chunk_output = None
        async for event in _generate_chunk(ai_service, messages, num_candidates):
            if event["type"] == "_chunk_result":
                chunk_output = event["text"]
            else:
                yield event

        rewritten_chunks.append(chunk_output or "")
        if i == 0 and len(chunks) > 1:
            voice = chunking.voice_sample(chunk_output or "")

    full_text = "\n\n".join(rewritten_chunks)

    try:
        patched = await _verify_and_patch(ai_service, full_text, style, expand, register)
    except Exception:
        logger.exception("humanizer_verify_failed")
        patched = None

    if patched:
        yield {"type": "revised", "text": patched}
