"""Three-pass Humaniser pipeline: analyze (Pass 1) -> rewrite (Pass 2,
streamed) -> verify + selective retry (Pass 3).

Maps onto the frontend's existing "reading -> writing -> done" phases:
Pass 1 runs during "reading", Pass 2 streams during "writing", and Pass 3
runs in the gap just before "done" — if it patches a paragraph, `run()`
yields one `revised` event carrying the full corrected text, which the
route turns into a `revised` SSE frame the client swaps in before marking
the run complete. Everything else about the token stream is unchanged.
"""

import logging

from app.services.humanizer import chunking, detector, examples as examples_module, prompts

logger = logging.getLogger(__name__)

MAX_RETRY_PARAGRAPHS = 8  # sane ceiling so one pathological verify pass can't fire off dozens of retry calls


def _resolve_style(style: str) -> str:
    return style if style in prompts.STYLE_GUIDANCE else prompts.DEFAULT_STYLE


def _build_rewrite_prompt(style: str, expand: bool, findings_text: str = "", voice: str = "") -> str:
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


def _build_retry_prompt(style: str, expand: bool, issues_text: str) -> str:
    hard_rules = prompts.EXPANDED_HARD_RULES if expand else prompts.STRICT_HARD_RULES
    guidance = prompts.STYLE_GUIDANCE[_resolve_style(style)]
    parts = [prompts.BASE_PROMPT, hard_rules, guidance]
    if issues_text:
        parts.append(issues_text)
    parts.append("Rewrite ONLY this paragraph in isolation. Return just the corrected paragraph text.")
    return "\n\n".join(parts)


async def _verify_and_patch(ai_service, full_text: str, style: str, expand: bool) -> str | None:
    """Pass 3. Returns the corrected full text if at least one paragraph was
    patched, or None if verification found nothing worth a retry (or the
    retry made no usable change)."""
    findings = await detector.verify(ai_service, full_text)
    flagged = sorted(detector.flagged_paragraphs(findings))[:MAX_RETRY_PARAGRAPHS]
    if not flagged:
        return None

    paragraphs = chunking.split_into_paragraphs(full_text)
    changed = False
    for idx in flagged:
        if idx < 0 or idx >= len(paragraphs):
            continue
        issues = [f for f in findings if f.get("paragraph") == idx]
        retry_prompt = _build_retry_prompt(style, expand, detector.findings_summary(issues))
        try:
            revised = await ai_service.rewrite_humanize_once(
                [("system", retry_prompt), ("human", paragraphs[idx])]
            )
        except Exception:
            logger.exception("humanizer_retry_failed paragraph=%d", idx)
            continue
        revised = (revised or "").strip()
        if revised:
            paragraphs[idx] = revised
            changed = True

    return "\n\n".join(paragraphs) if changed else None


async def run(ai_service, text: str, style: str = "normal", expand: bool = False):
    """Yields {"type": "token", "text": str} for each streamed rewrite token,
    then at most one {"type": "revised", "text": str} if Pass 3 patched a
    paragraph."""
    style = _resolve_style(style)
    chunks = chunking.chunk_text(text) if chunking.needs_chunking(text) else [text]

    rewritten_chunks: list[str] = []
    voice = ""

    for i, chunk in enumerate(chunks):
        findings = await detector.analyze(ai_service, chunk)
        findings_text = detector.findings_summary(findings)
        system_prompt = _build_rewrite_prompt(style, expand, findings_text, voice)

        chunk_output = ""
        async for token in ai_service.stream_humanize_rewrite([("system", system_prompt), ("human", chunk)]):
            chunk_output += token
            yield {"type": "token", "text": token}

        rewritten_chunks.append(chunk_output)
        if i == 0 and len(chunks) > 1:
            voice = chunking.voice_sample(chunk_output)

    full_text = "\n\n".join(rewritten_chunks)

    try:
        patched = await _verify_and_patch(ai_service, full_text, style, expand)
    except Exception:
        logger.exception("humanizer_verify_failed")
        patched = None

    if patched:
        yield {"type": "revised", "text": patched}
