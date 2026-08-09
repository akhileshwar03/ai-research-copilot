import asyncio

from app.services.humanizer.pipeline import run as run_pipeline


def _run(agen):
    async def collect():
        return [item async for item in agen]

    return asyncio.run(collect())


class _FakeAIService:
    """Drives the pipeline through analyze -> rewrite -> verify/retry with
    fully scripted responses, so each test can assert on exactly which
    passes ran and with what content."""

    def __init__(self, classify_responses, rewrite_tokens, retry_response="RETRIED"):
        self._classify_responses = list(classify_responses)
        self.classify_calls = []
        self.rewrite_tokens = rewrite_tokens
        self.rewrite_calls = []
        self.retry_response = retry_response
        self.retry_calls = []

    async def classify_humanize(self, messages):
        self.classify_calls.append(messages)
        idx = len(self.classify_calls) - 1
        return self._classify_responses[min(idx, len(self._classify_responses) - 1)]

    async def stream_humanize_rewrite(self, messages):
        self.rewrite_calls.append(messages)
        for token in self.rewrite_tokens[len(self.rewrite_calls) - 1]:
            yield token

    async def rewrite_humanize_once(self, messages):
        self.retry_calls.append(messages)
        return self.retry_response


NO_FINDINGS = '{"findings": []}'


def test_pipeline_streams_tokens_with_no_retry_when_verify_finds_nothing():
    fake_ai = _FakeAIService(
        classify_responses=[NO_FINDINGS, NO_FINDINGS],  # Pass 1 analyze, Pass 3 verify
        rewrite_tokens=[["Paragraph one.", " ", "Paragraph two."]],
    )

    events = _run(run_pipeline(fake_ai, "some source text", style="normal"))

    assert [e["type"] for e in events] == ["token", "token", "token"]
    assert "".join(e["text"] for e in events) == "Paragraph one. Paragraph two."
    assert len(fake_ai.classify_calls) == 2  # analyze + verify
    assert len(fake_ai.retry_calls) == 0


def test_pipeline_retries_a_flagged_paragraph_and_emits_revised_event():
    verify_response = (
        '{"findings": [{"type": "transition_spam", "paragraph": 0, "detail": "moreover"}]}'
    )
    fake_ai = _FakeAIService(
        classify_responses=[NO_FINDINGS, verify_response],
        rewrite_tokens=[["Paragraph one rewritten.\n\nParagraph two rewritten."]],
        retry_response="Paragraph one FIXED.",
    )

    events = _run(run_pipeline(fake_ai, "some source text", style="normal"))

    token_events = [e for e in events if e["type"] == "token"]
    revised_events = [e for e in events if e["type"] == "revised"]

    assert "".join(e["text"] for e in token_events) == "Paragraph one rewritten.\n\nParagraph two rewritten."
    assert len(revised_events) == 1
    assert revised_events[0]["text"] == "Paragraph one FIXED.\n\nParagraph two rewritten."

    # Retry demonstrably fired exactly once, only for the flagged paragraph.
    assert len(fake_ai.retry_calls) == 1
    retried_paragraph_message = fake_ai.retry_calls[0][1]
    assert retried_paragraph_message == ("human", "Paragraph one rewritten.")


def test_pipeline_does_not_retry_findings_with_no_paragraph_index():
    # A whole-text finding (paragraph: null) can't be targeted by a
    # single-paragraph retry, so it should be ignored rather than raising.
    verify_response = '{"findings": [{"type": "symmetric_structure", "paragraph": null, "detail": "x"}]}'
    fake_ai = _FakeAIService(
        classify_responses=[NO_FINDINGS, verify_response],
        rewrite_tokens=[["Some rewritten text."]],
    )

    events = _run(run_pipeline(fake_ai, "some source text", style="normal"))

    assert not [e for e in events if e["type"] == "revised"]
    assert len(fake_ai.retry_calls) == 0


def test_pipeline_chunks_long_input_into_multiple_rewrite_calls():
    long_text = "\n\n".join([f"Paragraph {i} " + ("word " * 200) for i in range(6)])  # ~1200 words total

    fake_ai = _FakeAIService(
        classify_responses=[NO_FINDINGS, NO_FINDINGS, NO_FINDINGS],
        rewrite_tokens=[["chunk one rewritten"], ["chunk two rewritten"], ["chunk three rewritten"]],
    )

    _run(run_pipeline(fake_ai, long_text, style="normal"))

    assert len(fake_ai.rewrite_calls) > 1
    # One analyze call per chunk, plus one verify call at the end.
    assert len(fake_ai.classify_calls) == len(fake_ai.rewrite_calls) + 1


def test_pipeline_carries_voice_sample_into_later_chunks():
    long_text = "\n\n".join([f"Paragraph {i} " + ("word " * 200) for i in range(6)])

    fake_ai = _FakeAIService(
        classify_responses=[NO_FINDINGS] * 10,
        rewrite_tokens=[["First chunk output. It sets the voice."], ["Second chunk output."], ["Third."]],
    )

    _run(run_pipeline(fake_ai, long_text, style="normal"))

    assert len(fake_ai.rewrite_calls) >= 2
    first_chunk_prompt = fake_ai.rewrite_calls[0][0][1]
    second_chunk_prompt = fake_ai.rewrite_calls[1][0][1]
    assert "voice and tone" not in first_chunk_prompt.lower()
    assert "voice and tone" in second_chunk_prompt.lower()
    assert "sets the voice" in second_chunk_prompt.lower()
