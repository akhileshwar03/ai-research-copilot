"""Free grammar/style writing feedback — a Grammarly-style pass.

LLM-based rather than rule-based: catches grammar, spelling, and style issues
via a single structured-JSON completion, then verifies every flagged span
actually appears in the source text before returning it (same pattern as
checker_service's ai_sentences verification) so a hallucinated quote can't
reach the UI.
"""

import json
import logging

from app.core.exceptions import AppError
from app.services.ai_service import AIService
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a meticulous writing editor, like a professional proofreader. \
Review the user's text for concrete issues: grammar errors, spelling mistakes, awkward or \
unclear phrasing, weak word choice, and style problems (wordiness, passive-voice overuse, \
inconsistent tense).

Only flag REAL issues — do not invent problems in text that already reads fine. A clean \
paragraph can have zero issues; do not pad the list to seem thorough.

For each issue, quote the exact original text verbatim (a short span — a few words to one \
sentence, never the whole paragraph), give a corrected replacement, classify it, and explain \
briefly why it's an issue.

Also give an overall writing-quality score from 0-100 (100 = flawless, publication-ready prose) \
and a one-sentence summary of the text's overall quality.

Respond with ONLY a JSON object, no other text: \
{"issues": [{"original": "<verbatim span>", "suggestion": "<corrected span>", \
"type": "grammar"|"spelling"|"style"|"clarity"|"word-choice", "explanation": "<short reason>"}], \
"overall_score": <int 0-100>, "summary": "<one sentence>"}"""

_MAX_ISSUES = 40
_VALID_TYPES = {"grammar", "spelling", "style", "clarity", "word-choice"}


class WritingFeedbackService:
    def __init__(self, ai_service: AIService):
        self.ai_service = ai_service

    async def analyze(self, text: str) -> dict:
        stripped = text.strip()
        if not stripped:
            raise AppError(code="EMPTY_TEXT", message="Text must not be empty", status_code=400)

        max_chars = int(runtime_settings.get("feedback_max_chars"))
        if len(stripped) > max_chars:
            raise AppError(
                code="TEXT_TOO_LONG",
                message=f"Text exceeds the {max_chars}-character limit",
                status_code=413,
            )

        try:
            raw = await self.ai_service.classify(
                [("system", _SYSTEM_PROMPT), ("human", stripped[:12000])]
            )
            parsed = json.loads(raw.strip().strip("`").removeprefix("json").strip())
        except Exception:
            logger.warning("writing_feedback_failed", exc_info=True)
            raise AppError(
                code="FEEDBACK_UNAVAILABLE",
                message="Writing feedback is temporarily unavailable. Please try again.",
                status_code=503,
            )

        issues = self._verified_issues(parsed.get("issues") or [], stripped)

        try:
            overall_score = max(0, min(100, int(parsed.get("overall_score"))))
        except (TypeError, ValueError):
            overall_score = 70  # neutral fallback if the model omitted/malformed the score

        return {
            "issues": issues,
            "overall_score": overall_score,
            "summary": str(parsed.get("summary", ""))[:300],
            "word_count": len(stripped.split()),
        }

    def _verified_issues(self, raw_issues: list, source: str) -> list[dict]:
        source_low = source.lower()
        out: list[dict] = []
        for item in raw_issues:
            if not isinstance(item, dict):
                continue
            original = str(item.get("original", "")).strip()
            suggestion = str(item.get("suggestion", "")).strip()
            issue_type = item.get("type") if item.get("type") in _VALID_TYPES else "style"
            explanation = str(item.get("explanation", ""))[:200]

            if len(original) < 2 or original.lower() not in source_low or not suggestion:
                continue

            out.append(
                {
                    "original": original,
                    "suggestion": suggestion,
                    "type": issue_type,
                    "explanation": explanation,
                }
            )
            if len(out) >= _MAX_ISSUES:
                break
        return out
