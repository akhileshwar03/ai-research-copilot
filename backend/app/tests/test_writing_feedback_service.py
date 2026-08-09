import asyncio
import json

import pytest

from app.core.exceptions import AppError
from app.services.writing_feedback_service import WritingFeedbackService


def _run(coro):
    return asyncio.run(coro)


class _FakeAIService:
    def __init__(self, response: str | Exception):
        self.response = response

    async def classify(self, messages):
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


SOURCE_TEXT = "This are a sentence with a grammar mistake in it, and it could read more clearly."


def test_analyze_returns_verified_issues():
    llm_response = json.dumps(
        {
            "issues": [
                {
                    "original": "This are a sentence",
                    "suggestion": "This is a sentence",
                    "type": "grammar",
                    "explanation": "Subject-verb agreement.",
                }
            ],
            "overall_score": 62,
            "summary": "Has a grammar issue but otherwise clear.",
        }
    )
    service = WritingFeedbackService(ai_service=_FakeAIService(llm_response))

    result = _run(service.analyze(SOURCE_TEXT))

    assert len(result["issues"]) == 1
    assert result["issues"][0]["type"] == "grammar"
    assert result["overall_score"] == 62
    assert result["word_count"] == len(SOURCE_TEXT.split())


def test_analyze_drops_hallucinated_issue_not_in_source():
    llm_response = json.dumps(
        {
            "issues": [
                {
                    "original": "text that never appears anywhere in the source",
                    "suggestion": "fixed",
                    "type": "style",
                    "explanation": "x",
                }
            ],
            "overall_score": 90,
            "summary": "Clean.",
        }
    )
    service = WritingFeedbackService(ai_service=_FakeAIService(llm_response))

    result = _run(service.analyze(SOURCE_TEXT))

    assert result["issues"] == []


def test_analyze_falls_back_score_when_malformed():
    llm_response = json.dumps({"issues": [], "overall_score": "not-a-number", "summary": "ok"})
    service = WritingFeedbackService(ai_service=_FakeAIService(llm_response))

    result = _run(service.analyze(SOURCE_TEXT))

    assert result["overall_score"] == 70


def test_analyze_raises_when_llm_fails():
    service = WritingFeedbackService(ai_service=_FakeAIService(RuntimeError("API down")))

    with pytest.raises(AppError) as exc_info:
        _run(service.analyze(SOURCE_TEXT))
    assert exc_info.value.code == "FEEDBACK_UNAVAILABLE"
    assert exc_info.value.status_code == 503


def test_analyze_raises_when_llm_returns_malformed_json():
    service = WritingFeedbackService(ai_service=_FakeAIService("not json at all"))

    with pytest.raises(AppError) as exc_info:
        _run(service.analyze(SOURCE_TEXT))
    assert exc_info.value.code == "FEEDBACK_UNAVAILABLE"


def test_analyze_rejects_empty_text():
    service = WritingFeedbackService(ai_service=_FakeAIService("{}"))
    with pytest.raises(AppError) as exc_info:
        _run(service.analyze("   "))
    assert exc_info.value.code == "EMPTY_TEXT"


def test_analyze_rejects_over_char_limit():
    service = WritingFeedbackService(ai_service=_FakeAIService("{}"))
    huge_text = "word " * 5000
    with pytest.raises(AppError) as exc_info:
        _run(service.analyze(huge_text))
    assert exc_info.value.code == "TEXT_TOO_LONG"
