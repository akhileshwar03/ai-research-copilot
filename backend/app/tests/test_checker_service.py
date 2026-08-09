import asyncio
import json

import pytest

from app.core.exceptions import AppError
from app.services.checker_service import CheckerService


def _run(coro):
    return asyncio.run(coro)


class _FakeAIService:
    def __init__(self, response: str | Exception):
        self.response = response

    async def classify(self, messages):
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


class _FakeAIServiceSequence:
    """Returns queued responses in order — one per `classify()` call — for
    tests that exercise check_text(advanced=True), which issues two calls."""

    def __init__(self, responses: list[str]):
        self.responses = list(responses)
        self.calls: list[list] = []

    async def classify(self, messages):
        self.calls.append(messages)
        return self.responses.pop(0)


def test_check_text_combines_heuristic_and_llm_signal():
    llm_response = json.dumps({"ai_probability": 0.9, "reasoning": "very uniform phrasing"})
    service = CheckerService(ai_service=_FakeAIService(llm_response))

    result = _run(service.check_text("This is a reasonably long test sentence for analysis purposes today."))

    assert result["signals"]["llm_probability"] == 0.9
    assert 0.0 <= result["ai_probability"] <= 1.0
    assert result["verdict"] in ("likely_human", "uncertain", "likely_ai")
    assert result["disclaimer"]  # never empty — always shown


def test_check_text_falls_back_to_heuristic_only_when_llm_fails():
    service = CheckerService(ai_service=_FakeAIService(RuntimeError("API down")))

    result = _run(service.check_text("Some text that will only get the heuristic signal applied to it."))

    assert result["signals"]["llm_probability"] is None
    # Falls back to heuristic-only score, still bounded and present.
    assert 0.0 <= result["ai_probability"] <= 1.0


def test_check_text_falls_back_when_llm_returns_malformed_json():
    service = CheckerService(ai_service=_FakeAIService("not json at all"))

    result = _run(service.check_text("Text that triggers a malformed LLM response path here."))

    assert result["signals"]["llm_probability"] is None


def test_check_text_rejects_empty_text():
    service = CheckerService(ai_service=_FakeAIService("{}"))
    with pytest.raises(AppError) as exc_info:
        _run(service.check_text("   "))
    assert exc_info.value.code == "EMPTY_TEXT"
    assert exc_info.value.status_code == 400


def test_check_text_rejects_over_char_limit():
    service = CheckerService(ai_service=_FakeAIService("{}"))
    huge_text = "word " * 5000  # over the 20000-char default limit
    with pytest.raises(AppError) as exc_info:
        _run(service.check_text(huge_text))
    assert exc_info.value.code == "TEXT_TOO_LONG"
    assert exc_info.value.status_code == 413


def test_check_text_short_input_flagged_low_confidence():
    service = CheckerService(ai_service=_FakeAIService(json.dumps({"ai_probability": 0.5, "reasoning": "x"})))
    result = _run(service.check_text("Too short."))
    assert result["confidence"] == "low"


# Well-varied, clean prose (high burstiness, high lexical diversity -> low
# heuristic AI score) that the LLM is confident is AI. The old weighting let
# the "human-looking" heuristic drag the blend down to ~0.5 ("uncertain"); the
# reworked blend must keep a confident LLM AI-call decisive.
_CLEAN_BUT_AI_TEXT = (
    "The transition to renewable energy represents one of the defining challenges of "
    "our era. Solar and wind capacity have expanded dramatically over the past decade. "
    "Storage technology, though still maturing, promises to smooth the intermittency "
    "that once made these sources impractical. Policymakers now face difficult choices "
    "about how to accelerate deployment while protecting existing communities and jobs."
)


def test_confident_llm_ai_call_not_dragged_down_by_clean_heuristics():
    llm_response = json.dumps(
        {
            "ai_probability": 0.88,
            "reasoning": "Generic, textbook phrasing with no personal voice.",
            "ai_sentences": ["The transition to renewable energy represents one of the defining challenges of our era."],
        }
    )
    service = CheckerService(ai_service=_FakeAIService(llm_response))

    result = _run(service.check_text(_CLEAN_BUT_AI_TEXT))

    # The heuristic alone would read this as human (varied, diverse, no tells)...
    assert result["signals"]["heuristic_score"] < 40
    # ...but the confident LLM call must carry it to a decisive AI verdict.
    assert result["verdict"] == "likely_ai"
    assert result["ai_probability"] > 0.6


def test_ai_sentences_are_verified_against_source():
    # One real sentence from the source, one hallucinated -> only the real one survives.
    llm_response = json.dumps(
        {
            "ai_probability": 0.8,
            "reasoning": "x",
            "ai_sentences": [
                "Solar and wind capacity have expanded dramatically over the past decade.",
                "This sentence never appears anywhere in the source text at all.",
            ],
        }
    )
    service = CheckerService(ai_service=_FakeAIService(llm_response))

    result = _run(service.check_text(_CLEAN_BUT_AI_TEXT))

    assert result["ai_sentences"] == [
        "Solar and wind capacity have expanded dramatically over the past decade."
    ]


# ── Advanced Scan (paragraph breakdown) ─────────────────────────────────────

_MULTI_PARAGRAPH_TEXT = (
    "Paragraph one talks about renewable energy trends and their broad economic impact today.\n\n"
    "Paragraph two is a short personal note about my own experience installing solar panels."
)


def test_advanced_scan_returns_paragraph_breakdown():
    llm_response = json.dumps({"ai_probability": 0.7, "reasoning": "x", "ai_sentences": []})
    paragraph_response = json.dumps(
        {
            "segments": [
                {"index": 1, "ai_probability": 0.85},
                {"index": 2, "ai_probability": 0.15},
            ]
        }
    )
    service = CheckerService(ai_service=_FakeAIServiceSequence([llm_response, paragraph_response]))

    result = _run(service.check_text(_MULTI_PARAGRAPH_TEXT, advanced=True))

    assert len(result["paragraphs"]) == 2
    assert result["paragraphs"][0]["verdict"] == "likely_ai"
    assert result["paragraphs"][1]["verdict"] == "likely_human"
    # Order preserved regardless of the order segments came back in.
    assert result["paragraphs"][0]["text"].startswith("Paragraph one")
    assert result["paragraphs"][1]["text"].startswith("Paragraph two")


def test_basic_scan_omits_paragraph_breakdown():
    llm_response = json.dumps({"ai_probability": 0.7, "reasoning": "x", "ai_sentences": []})
    service = CheckerService(ai_service=_FakeAIService(llm_response))

    result = _run(service.check_text(_MULTI_PARAGRAPH_TEXT, advanced=False))

    assert result["paragraphs"] == []


def test_advanced_scan_degrades_gracefully_when_breakdown_call_fails():
    llm_response = json.dumps({"ai_probability": 0.7, "reasoning": "x", "ai_sentences": []})
    service = CheckerService(ai_service=_FakeAIServiceSequence([llm_response, "not valid json"]))

    result = _run(service.check_text(_MULTI_PARAGRAPH_TEXT, advanced=True))

    # Overall result still comes through fine even though the breakdown failed.
    assert result["ai_probability"] > 0
    assert result["paragraphs"] == []


def test_advanced_scan_skipped_for_short_single_segment_text():
    llm_response = json.dumps({"ai_probability": 0.7, "reasoning": "x", "ai_sentences": []})
    service = CheckerService(ai_service=_FakeAIServiceSequence([llm_response]))

    result = _run(service.check_text("Too short to break down.", advanced=True))

    # Under 2 segments -> no second LLM call is made at all.
    assert result["paragraphs"] == []
