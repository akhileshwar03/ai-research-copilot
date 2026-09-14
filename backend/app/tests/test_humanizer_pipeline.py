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

    def __init__(self, classify_responses, rewrite_tokens, retry_response="RETRIED", once_responses=None, num_candidates=None):
        self._classify_responses = list(classify_responses)
        self.classify_calls = []
        self.rewrite_tokens = rewrite_tokens
        self.rewrite_calls = []
        self.retry_response = retry_response
        self.retry_calls = []
        # rewrite_humanize_once is shared by best-of-N candidate generation and the
        # Pass-3 selective-paragraph retry (same as production AIService) -- when a
        # test wants to script specific candidates it passes once_responses and
        # each call consumes the next entry in order (falling back to retry_response
        # once exhausted, covering the later Pass-3 retry call in the same test).
        self._once_responses = list(once_responses) if once_responses is not None else None
        self.once_calls = []
        self.settings = _FakeSettings(num_candidates) if num_candidates is not None else None

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
        idx = len(self.once_calls)
        self.once_calls.append(messages)
        if self._once_responses is not None and idx < len(self._once_responses):
            scripted = self._once_responses[idx]
            # An exception instance in once_responses is raised rather than returned, so
            # tests can script a partially-failing best-of-N batch (a transient 500 or
            # rate limit on one of the N redundant calls).
            if isinstance(scripted, BaseException):
                raise scripted
            return scripted
        return self.retry_response


class _FakeSettings:
    def __init__(self, humanizer_num_candidates):
        self.humanizer_num_candidates = humanizer_num_candidates


NO_FINDINGS = '{"findings": []}'


def test_pipeline_streams_tokens_with_no_retry_when_verify_finds_nothing():
    fake_ai = _FakeAIService(
        classify_responses=[NO_FINDINGS, NO_FINDINGS],  # Pass 1 analyze, Pass 3 verify
        rewrite_tokens=[["Paragraph one.", " ", "Paragraph two."]],
    )

    events = _run(run_pipeline(fake_ai, "some source text", style="normal"))

    assert [e["type"] for e in events] == ["token", "token", "token"]
    assert "".join(e["text"] for e in events) == "Paragraph one. Paragraph two."
    # 2026-09-13, Round 34: register classify + analyze + verify.
    assert len(fake_ai.classify_calls) == 3
    assert len(fake_ai.retry_calls) == 0


def test_pipeline_retries_a_flagged_paragraph_and_emits_revised_event():
    verify_response = (
        '{"findings": [{"type": "transition_spam", "paragraph": 0, "detail": "moreover"}]}'
    )
    fake_ai = _FakeAIService(
        # 2026-09-13, Round 34: register classify + analyze + verify, in that order.
        classify_responses=["casual", NO_FINDINGS, verify_response],
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
        classify_responses=["casual", NO_FINDINGS, verify_response],
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
    # One register-classify call up front, one analyze call per chunk, plus one verify
    # call at the end (2026-09-13, Round 34: register classify added).
    assert len(fake_ai.classify_calls) == len(fake_ai.rewrite_calls) + 2


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


def test_pipeline_best_of_n_picks_the_least_ai_sounding_candidate_and_streams_it():
    # 3 candidates, all generated from the SAME source chunk (not chained on each
    # other): one is riddled with banned AI vocabulary and uniform sentence
    # length, the other two are clean and bursty. The heuristic must reject the
    # bad one and only the winner's text should reach the client as tokens.
    bad_candidate = "It is important to note that this is crucial. Moreover, this is pivotal. Additionally, this is crucial."
    good_candidate_a = "This matters a lot. Here's the real reason it does, laid out plainly for anyone paying attention."
    good_candidate_b = "Here's the thing: it matters. Why? Because ignoring it costs more than fixing it ever will."

    fake_ai = _FakeAIService(
        classify_responses=[NO_FINDINGS, NO_FINDINGS],  # analyze + verify, candidates aren't separately classified
        rewrite_tokens=[],  # best-of-N never calls stream_humanize_rewrite
        once_responses=[bad_candidate, good_candidate_a, good_candidate_b],
        num_candidates=3,
    )

    events = _run(run_pipeline(fake_ai, "some source text", style="normal"))

    # All 3 candidates were generated, each from the original source chunk.
    assert len(fake_ai.once_calls) == 3
    assert all(call[1] == ("human", "some source text") for call in fake_ai.once_calls)

    # Zero real streaming calls -- best-of-N replaces the live stream entirely.
    assert len(fake_ai.rewrite_calls) == 0

    # The reconstructed token stream is exactly one of the two clean candidates,
    # never the banned-vocabulary-heavy one.
    streamed_text = "".join(e["text"] for e in events if e["type"] == "token")
    assert streamed_text in (good_candidate_a, good_candidate_b)
    assert "crucial" not in streamed_text.lower()
    assert "moreover" not in streamed_text.lower()


def test_pipeline_defaults_to_single_candidate_when_settings_unavailable():
    # No `settings`/`humanizer_num_candidates` on the fake service (as in every
    # other test in this file) -- pipeline must fall back to the original
    # single real streamed call rather than erroring or firing extra candidates.
    fake_ai = _FakeAIService(
        classify_responses=[NO_FINDINGS, NO_FINDINGS],
        rewrite_tokens=[["single candidate output"]],
    )

    events = _run(run_pipeline(fake_ai, "some source text", style="normal"))

    token_events = [e for e in events if e["type"] == "token"]
    assert "".join(e["text"] for e in token_events) == "single candidate output"
    assert len(fake_ai.once_calls) == 0  # no best-of-N candidates, no retry fired


# ── Best-of-N resilience (2026-08-13 audit) ──────────────────────────────────


def test_partial_candidate_failure_still_produces_a_result():
    """A transient failure on one of the N redundant candidate calls must not
    destroy the run. Before return_exceptions=True, a single raised exception
    propagated out of asyncio.gather, out of the pipeline generator, and the
    route converted it into an `event: error` frame — the user lost the whole
    rewrite because 1 of 3 duplicate calls failed. Best-of-N is redundancy;
    it has to degrade, not amplify."""
    fake_ai = _FakeAIService(
        classify_responses=[NO_FINDINGS, NO_FINDINGS],
        rewrite_tokens=[],
        once_responses=[
            RuntimeError("transient upstream 500"),
            "The survivor. It reads fine, and it varies its length quite a lot from line to line.",
            "Another survivor here.",
        ],
        num_candidates=3,
    )

    events = _run(run_pipeline(fake_ai, "some source text", style="normal"))

    streamed_text = "".join(e["text"] for e in events if e["type"] == "token")
    assert streamed_text.strip()  # a real result, not an error and not empty
    assert "survivor" in streamed_text


def test_all_candidates_failing_falls_back_to_a_single_streamed_call():
    """Total best-of-N failure degrades to one ordinary streamed rewrite rather
    than silently dropping the chunk's text out of the finished document."""
    fake_ai = _FakeAIService(
        classify_responses=[NO_FINDINGS, NO_FINDINGS],
        rewrite_tokens=[["fallback ", "stream ", "output"]],
        once_responses=[RuntimeError("boom"), RuntimeError("boom"), RuntimeError("boom")],
        num_candidates=3,
    )

    events = _run(run_pipeline(fake_ai, "some source text", style="normal"))

    assert len(fake_ai.rewrite_calls) == 1  # the fallback streamed call
    assert "".join(e["text"] for e in events if e["type"] == "token") == "fallback stream output"


def test_all_candidates_blank_does_not_crash_on_scoring():
    """min(candidates, key=_ai_likelihood_score) used to be handed None/"" when
    every candidate came back blank, raising AttributeError inside the scorer."""
    fake_ai = _FakeAIService(
        classify_responses=[NO_FINDINGS, NO_FINDINGS],
        rewrite_tokens=[["recovered output"]],
        once_responses=["", "   ", None],
        num_candidates=3,
    )

    events = _run(run_pipeline(fake_ai, "some source text", style="normal"))

    assert "".join(e["text"] for e in events if e["type"] == "token") == "recovered output"


def test_scorer_rejects_vocabulary_banned_only_by_the_aggressive_prompt():
    """The aggressive prompt is what actually runs for style=normal/expand=off —
    the only configuration the UI can produce — and it bans terms that aren't in
    BANNED_VOCABULARY. The scorer used to ignore those entirely, so best-of-N
    would happily crown a candidate stuffed with them."""
    from app.services.humanizer.pipeline import _ai_likelihood_score

    aggressive_only = "This is a beacon that will resonate, a real game-changer, inherently powered by a new paradigm."
    clean = "It changes things. Quite a lot, actually, once you sit with how the parts fit together and why."

    assert _ai_likelihood_score(clean) < _ai_likelihood_score(aggressive_only)


def test_banned_vocabulary_outweighs_burstiness_in_scoring():
    """Burstiness is an unbounded stdev while a banned hit used to cost a flat 3,
    so a candidate carrying several banned AI words could win on length variance
    alone. Zero banned vocabulary is a hard rule; burstiness is a preference."""
    from app.services.humanizer.pipeline import _ai_likelihood_score

    # Deliberately high length variance, but three banned words.
    bursty_but_banned = (
        "Delve in. This tapestry of an ever-evolving landscape is something we should all sit with for "
        "a good while before we say anything else at all about it. Stop."
    )
    # Flat, uniform sentence lengths — genuinely worse burstiness — but clean.
    flat_but_clean = "The cat sat down. The dog ran off. The bird flew away. The fish swam on."

    assert _ai_likelihood_score(flat_but_clean) < _ai_likelihood_score(bursty_but_banned)


def test_empty_text_scores_as_worst_possible():
    from app.services.humanizer.pipeline import _ai_likelihood_score

    assert _ai_likelihood_score("") == float("inf")
    assert _ai_likelihood_score(None) == float("inf")
