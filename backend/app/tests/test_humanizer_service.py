import asyncio

import pytest

from app.core.exceptions import AppError
from app.services.humanizer_service import HumanizerService


def _run(agen):
    """Drain an async generator synchronously — avoids depending on the
    pytest-asyncio plugin (listed in requirements.txt but not installed in
    this venv)."""
    async def collect():
        return [item async for item in agen]

    return asyncio.run(collect())


class _FakeAIService:
    """Minimal stand-in exercising only what HumanizerService.stream()
    reaches through the pipeline: classify_humanize (Pass 1/3) and
    stream_humanize_rewrite (Pass 2). Returns no findings by default so
    tests here stay focused on service-level wiring, not pipeline behavior
    (covered separately in test_humanizer_pipeline.py)."""

    def __init__(self, tokens: list[str] | None = None):
        self.tokens = tokens if tokens is not None else ["rewritten", " ", "text"]
        self.rewrite_calls = []
        self.classify_calls = []

    async def classify_humanize(self, messages):
        self.classify_calls.append(messages)
        return '{"findings": []}'

    async def stream_humanize_rewrite(self, messages):
        self.rewrite_calls.append(messages)
        for token in self.tokens:
            yield token


def _service(ai_service=None) -> HumanizerService:
    return HumanizerService(ai_service=ai_service or _FakeAIService(), run_repo=None, user_repo=None)


def test_validate_rejects_empty_text():
    with pytest.raises(AppError) as exc_info:
        _service().validate("   ")
    assert exc_info.value.code == "EMPTY_TEXT"
    assert exc_info.value.status_code == 400


def test_validate_rejects_text_over_char_limit():
    huge_text = "word " * 5000  # ~25000 chars, over the 20000 default limit
    with pytest.raises(AppError) as exc_info:
        _service().validate(huge_text)
    assert exc_info.value.code == "TEXT_TOO_LONG"
    assert exc_info.value.status_code == 413


def test_validate_rejects_text_over_word_maximum():
    # Short words keep char count (~9000) well under the 20000 char limit,
    # isolating the word-count check (default max 3000).
    huge_word_count_text = "hi " * 3001
    with pytest.raises(AppError) as exc_info:
        _service().validate(huge_word_count_text)
    assert exc_info.value.code == "TEXT_TOO_LONG"
    assert exc_info.value.status_code == 413
    assert "word limit" in exc_info.value.message


def test_validate_rejects_text_under_word_minimum():
    with pytest.raises(AppError) as exc_info:
        _service().validate("just a few words here")
    assert exc_info.value.code == "TEXT_TOO_SHORT"
    assert exc_info.value.status_code == 400


def test_validate_strips_and_returns_text():
    body = ("padded word " * 16).strip()  # 32 words, comfortably over the 30-word minimum
    assert _service().validate(f"  {body}  ") == body


def test_stream_yields_token_events_from_pipeline():
    fake_ai = _FakeAIService(["hello", " ", "world"])
    service = _service(fake_ai)

    events = _run(service.stream("some input text over the word minimum here, comfortably so"))

    assert [e["type"] for e in events] == ["token", "token", "token"]
    assert [e["text"] for e in events] == ["hello", " ", "world"]
    assert len(fake_ai.rewrite_calls) == 1
    # Pass 1 analyze runs before the rewrite call, Pass 3 verify runs after —
    # two classify_humanize calls even when nothing gets flagged.
    assert len(fake_ai.classify_calls) == 2


def test_stream_passes_style_through_to_rewrite_prompt():
    fake_ai = _FakeAIService()
    service = _service(fake_ai)
    _run(service.stream("some text here", style="simple_formal"))
    system_prompt = fake_ai.rewrite_calls[0][0][1].lower()
    assert "business and professional writing" in system_prompt


def test_stream_falls_back_to_normal_for_unknown_style():
    fake_ai = _FakeAIService()
    service = _service(fake_ai)
    _run(service.stream("some text here", style="not-a-real-style"))
    system_prompt = fake_ai.rewrite_calls[0][0][1].lower()
    assert "blog posts, social copy" in system_prompt


def test_stream_defaults_to_strict_fidelity_rules():
    fake_ai = _FakeAIService()
    service = _service(fake_ai)
    _run(service.stream("some text here"))
    system_prompt = fake_ai.rewrite_calls[0][0][1].lower()
    assert "never add, remove, or alter any factual content" in system_prompt
    assert "brief clarifying elaboration" not in system_prompt


def test_stream_expand_relaxes_fidelity_rules():
    fake_ai = _FakeAIService()
    service = _service(fake_ai)
    _run(service.stream("some text here", expand=True))
    system_prompt = fake_ai.rewrite_calls[0][0][1].lower()
    assert "brief clarifying elaboration" in system_prompt
    assert "never add, remove, or alter any factual content" not in system_prompt
    assert "never invent specific facts" in system_prompt
