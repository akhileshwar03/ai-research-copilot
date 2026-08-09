"""Shared AI-tell detector used by Pass 1 (analyze, before rewriting) and
Pass 3 (verify, after rewriting) — same detection prompt and parsing, just
pointed at different text. Keeping one implementation means "what Pass 3
checks for" can never quietly drift from "what Pass 1 flagged".
"""

import json
import logging

from app.services.humanizer.prompts import BANNED_VOCABULARY

logger = logging.getLogger(__name__)

_DETECTOR_PROMPT_TEMPLATE = """You are an AI-text detector. Read the text below and identify \
concrete AI-writing tells. Respond with strict JSON and nothing else — no markdown fences, no \
commentary before or after.

Detect, at minimum:
- Uniform sentence lengths (low variance across consecutive sentences)
- Parallel triads ("clear, concise, and compelling")
- Transition spam: moreover, furthermore, additionally, in conclusion, it's worth noting, it's \
important to note, and similar
- AI vocabulary: {banned_list}
- Em dash or semicolon overuse
- Hedging stacks ("can potentially help to...")
- Symmetric paragraph structure (every paragraph roughly the same length/shape, or every \
paragraph following the same claim-then-support-then-close pattern even with different wording)
- Empty openers ("In today's fast-paced world...")
- Uniform vocabulary register (every sentence sitting at the same comfortable, mid-frequency \
word-choice level, with no genuinely specific or unexpected word choices anywhere)

The text is split into paragraphs by blank lines; number them starting at 0 in reading order.

Return exactly this JSON shape, and nothing else:
{{"findings": [{{"type": "<category>", "paragraph": <0-based paragraph index, or null if it \
applies to the whole text>, "detail": "<the specific phrase or pattern found>"}}]}}

If nothing is found, return {{"findings": []}}."""

DETECTOR_SYSTEM_PROMPT = _DETECTOR_PROMPT_TEMPLATE.format(banned_list=", ".join(BANNED_VOCABULARY))


def parse_findings(raw: str) -> list[dict]:
    """Defensively parse the detector's JSON response. Never raises —
    Pass 1/3 are optimizations on top of the rewrite, not a correctness
    requirement, so a malformed or truncated response degrades to "no
    findings" rather than breaking the pipeline."""
    if not raw:
        return []
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        logger.warning("humanizer_detector_json_parse_failed raw=%r", raw[:200])
        return []
    if not isinstance(parsed, dict):
        return []
    findings = parsed.get("findings")
    if not isinstance(findings, list):
        return []
    return [f for f in findings if isinstance(f, dict) and isinstance(f.get("detail"), str) and f.get("detail")]


async def analyze(ai_service, text: str) -> list[dict]:
    """Pass 1: detect AI tells in the source text before rewriting."""
    raw = await ai_service.classify_humanize([("system", DETECTOR_SYSTEM_PROMPT), ("human", text)])
    return parse_findings(raw)


async def verify(ai_service, text: str) -> list[dict]:
    """Pass 3: re-run the same detector against the rewritten output."""
    raw = await ai_service.classify_humanize([("system", DETECTOR_SYSTEM_PROMPT), ("human", text)])
    return parse_findings(raw)


def findings_summary(findings: list[dict]) -> str:
    """Render findings as a short bullet list to inject into the Pass 2
    rewrite prompt as 'specific problems to fix'."""
    if not findings:
        return ""
    lines = [f"- {f.get('type', 'issue')}: {f.get('detail', '')}" for f in findings]
    return "Specific problems detected in this text — fix these:\n" + "\n".join(lines)


def flagged_paragraphs(findings: list[dict]) -> set[int]:
    """Distinct 0-based paragraph indices with a flagged issue. Findings
    with no paragraph index (whole-text issues) aren't included — they
    can't be targeted by a single-paragraph retry."""
    return {f["paragraph"] for f in findings if isinstance(f.get("paragraph"), int)}
