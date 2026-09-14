"""Tests for detector.classify_register (2026-09-13, Round 34) — decides which of
AGGRESSIVE_REWRITE_PROMPT's two register profiles applies, computed once from the source
text rather than left for the rewrite model to self-classify mid-rewrite."""

import asyncio

from app.services.humanizer import detector


def _run(coro):
    return asyncio.run(coro)


class _FakeAIService:
    def __init__(self, response=None, raise_exc=None):
        self._response = response
        self._raise_exc = raise_exc
        self.calls = []

    async def classify_humanize(self, messages):
        self.calls.append(messages)
        if self._raise_exc:
            raise self._raise_exc
        return self._response


def test_classify_register_returns_formal_when_model_says_formal():
    fake_ai = _FakeAIService(response="formal")
    assert _run(detector.classify_register(fake_ai, "some text")) == "formal"


def test_classify_register_returns_casual_when_model_says_casual():
    fake_ai = _FakeAIService(response="casual")
    assert _run(detector.classify_register(fake_ai, "some text")) == "casual"


def test_classify_register_defaults_to_casual_on_ambiguous_response():
    # Neither "formal" nor a clean "casual" -- e.g. a wordy/malformed response.
    fake_ai = _FakeAIService(response="I'm not sure, could be either one honestly")
    assert _run(detector.classify_register(fake_ai, "some text")) == "casual"


def test_classify_register_defaults_to_casual_on_exception():
    # Casual is this project's original, most real-detector-tested register -- failing
    # toward it is safer than failing toward the newer, less-tested formal profile.
    fake_ai = _FakeAIService(raise_exc=RuntimeError("upstream 500"))
    assert _run(detector.classify_register(fake_ai, "some text")) == "casual"


def test_classify_register_defaults_to_casual_on_empty_response():
    fake_ai = _FakeAIService(response="")
    assert _run(detector.classify_register(fake_ai, "some text")) == "casual"


def test_classify_register_is_case_insensitive():
    fake_ai = _FakeAIService(response="FORMAL")
    assert _run(detector.classify_register(fake_ai, "some text")) == "formal"
