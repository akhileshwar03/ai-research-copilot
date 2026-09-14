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


_REGISTER_PROMPT = """Classify the CONTENT TYPE of the text below, not its current tone or \
wording. Answer with exactly one word: "casual" or "formal".

2026-09-13, Round 35 correction: an earlier version of this prompt classified procedural \
how-to/instructional content as "formal" by default. That was tested for real and made \
things measurably worse (QuillBot AI-score went from 45% to 97% on identical how-to content \
switching from casual to formal register) — real AI detectors are calibrated against \
contemporary (roughly 2015-2024) web writing, where even modern how-to guides and blog \
instructions are written casually, with direct address and contractions. "Formal" should be \
reserved for genuinely dry reference material, not for instructional content generally.

- "casual": a product/gadget review, an opinion or personal piece, a blog post, a first-person \
narrative, OR a how-to/instructional guide of the kind actually published on the modern web \
(a recipe blog, a WikiHow-style guide, a product setup guide) — anything where a real modern \
human writer would naturally address the reader directly and write conversationally, even if \
the specific text you're given happens to read stiffly right now. This is the default for \
almost everything — judge the CONTENT TYPE, not the current writing style.
- "formal": ONLY for genuinely dry reference/encyclopedic material with no instructional \
framing at all — a definition, a technical specification, an explainer written in third \
person throughout with no direct address anywhere. If the text could plausibly appear as a \
numbered step-by-step guide, a review, or an opinion piece, classify it "casual", not \
"formal", even if it currently reads dry.

Respond with exactly one word and nothing else: casual or formal."""


async def classify_register(ai_service, text: str) -> str:
    """2026-09-13, Round 34: decides which of AGGRESSIVE_REWRITE_PROMPT's two register
    profiles (casual/formal, see prompts.py) applies to a given source text, computed
    ONCE from the source before any rewriting -- not left to the rewrite model to judge
    for itself mid-rewrite. This exists because asking the rewrite model to both (a)
    classify the content's register and (b) simultaneously override the source's often-
    already-formal surface tone to match that register was tested twice for real and
    failed both times (see STATE.md Round 34): a product review with zero personal
    address in its AI-generated source stayed zero-contraction, zero-"you" even after an
    explicit "override the source's surface tone" instruction was added. Splitting the
    decision out to its own focused, single-purpose call removes that double burden.

    Defaults to "casual" on any parse failure or classifier error -- casual is this
    project's original, most real-detector-tested register (the 2026-08-13 "Prompt G"
    baseline that beat every alternative tried that day), so failing toward it is safer
    than failing toward the newer, less-tested formal profile."""
    try:
        raw = await ai_service.classify_humanize([("system", _REGISTER_PROMPT), ("human", text)])
    except Exception:
        logger.exception("humanizer_register_classify_failed")
        return "casual"
    normalized = (raw or "").strip().lower()
    if "formal" in normalized and "casual" not in normalized:
        return "formal"
    return "casual"


def flagged_paragraphs(findings: list[dict]) -> set[int]:
    """Distinct 0-based paragraph indices with a flagged issue. Findings
    with no paragraph index (whole-text issues) aren't included — they
    can't be targeted by a single-paragraph retry.

    The bool exclusion is load-bearing, not defensive noise: bool subclasses
    int in Python, so a model emitting `"paragraph": true` (a plausible
    malformed response for "yes, this paragraph has an issue") would silently
    become a retry of paragraph 1 — some unrelated paragraph rewritten against
    another paragraph's findings."""
    return {
        f["paragraph"]
        for f in findings
        if isinstance(f.get("paragraph"), int) and not isinstance(f.get("paragraph"), bool)
    }
