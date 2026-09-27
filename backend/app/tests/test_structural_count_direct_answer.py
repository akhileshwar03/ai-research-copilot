"""A pure "how many references/figures/tables" question is answered directly from the document's
real, pre-computed structural facts (structure_detector.py via document_structural_counts) --
never sent to the LLM at all. This closes a real production gap found 2026-09-27: even with rule
11 (see test_structural_counts_in_chat.py) telling the model to defer to the fact, insistent
phrasing ("Give me one final number: how many tables total, exactly.") could still talk
gpt-4.1-mini into fabricating a confident count from a handful of retrieved excerpts. A question
that never reaches the model can't be talked into anything."""

import asyncio

import pytest

from app.services.chat_service import ChatService, _structural_count_answer, _structural_count_intent


def _run(agen):
    async def collect():
        return [item async for item in agen]

    return asyncio.run(collect())


class _ExplodingRetrieval:
    """Any call here means the bypass failed to bypass -- retrieval must never run for a pure
    structural-count question."""

    async def retrieve_context(self, *a, **k):
        raise AssertionError("retrieve_context should not be called for a pure structural-count question")

    def get_max_indexed_pages(self, *a, **k):
        raise AssertionError("get_max_indexed_pages should not be called for a pure structural-count question")

    def get_full_document_context(self, *a, **k):
        raise AssertionError("get_full_document_context should not be called for a pure structural-count question")

    def get_page_context(self, *a, **k):
        raise AssertionError("get_page_context should not be called for a pure structural-count question")


class _ExplodingAI:
    """Any call here means insistent phrasing could still reach an LLM to talk it out of the
    real answer -- exactly the bug this bypass exists to eliminate."""

    async def stream_chat(self, messages):
        raise AssertionError("stream_chat should not be called for a pure structural-count question")
        yield  # pragma: no cover - unreachable, keeps this an async generator

    async def classify(self, messages):
        raise AssertionError("classify should not be called for a pure structural-count question")

    async def condense_query(self, messages):
        raise AssertionError("condense_query should not be called for a pure structural-count question")


# --- intent detection ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "message,expected",
    [
        ("How many references, figures, and tables does this document have?", {"references", "figures", "tables"}),
        ("Exactly how many figures and how many tables does this document contain in total?", {"figures", "tables"}),
        ("How many references does this document cite in total?", {"references"}),
        # the exact real production phrasing that beat the prompt-level rule 11 fix:
        ("Give me one final number: how many tables total, exactly.", {"tables"}),
        ("What is the total count of citations?", {"references"}),
        ("How many works cited are there?", {"references"}),
    ],
)
def test_pure_count_questions_are_detected(message, expected):
    assert _structural_count_intent(message) == expected


@pytest.mark.parametrize(
    "message",
    [
        "Can you list the titles or captions of all the figures and tables mentioned in the document?",
        "Are there any sections that summarize or index all tables and figures?",
        "Summarize the key findings and also tell me how many tables are in it",
        "What are the titles of the tables?",
        "How many questions does this document have?",  # not a references/figures/tables word at all
        "What is the abstract about?",
        "Compare the figures across both documents",
    ],
)
def test_mixed_or_unrelated_questions_are_not_intercepted(message):
    assert _structural_count_intent(message) == set()


# --- deterministic answer text -------------------------------------------------------------


def test_answer_states_known_counts_and_unknown_facts_separately():
    counts = {"d.pdf": {"references": {"count": 40, "exact": True}, "figures": {"count": 5, "exact": False}}}
    answer = _structural_count_answer({"references", "figures", "tables"}, ["d.pdf"], {"d.pdf": "Doc.pdf"}, counts)
    assert "exactly 40 references" in answer
    assert "at least 5 figures" in answer
    assert "number of tables cannot be reliably determined" in answer


def test_answer_all_unavailable_never_states_a_number():
    answer = _structural_count_answer({"figures", "tables"}, ["d.pdf"], {"d.pdf": "Doc.pdf"}, {})
    assert "cannot be reliably determined" in answer
    assert not any(ch.isdigit() for ch in answer)


def test_answer_covers_each_selected_document_independently():
    counts = {"a.pdf": {"tables": {"count": 4, "exact": True}}}
    answer = _structural_count_answer({"tables"}, ["a.pdf", "b.pdf"], {"a.pdf": "A.pdf", "b.pdf": "B.pdf"}, counts)
    assert "A.pdf" in answer and "B.pdf" in answer
    assert "exactly 4 tables" in answer
    assert "number of tables cannot be reliably determined" in answer


# --- end-to-end bypass through stream_response ----------------------------------------------


def test_stream_response_bypasses_retrieval_and_the_llm_entirely():
    events = _run(
        ChatService(_ExplodingRetrieval(), _ExplodingAI()).stream_response(
            messages=[{"role": "user", "content": "Give me one final number: how many tables total, exactly."}],
            document_ids=["d.pdf"],
            document_names={"d.pdf": "Doc.pdf"},
            document_structural_counts={},
            user_email="u@x.com",
        )
    )
    assert events[0] == {"type": "sources", "sources": ["d.pdf"]}
    assert len(events) == 2
    assert "cannot be reliably determined" in events[1]["value"]
    assert not any(ch.isdigit() for ch in events[1]["value"])


def test_stream_response_bypass_reports_a_real_known_count():
    events = _run(
        ChatService(_ExplodingRetrieval(), _ExplodingAI()).stream_response(
            messages=[{"role": "user", "content": "How many references does this document cite?"}],
            document_ids=["d.pdf"],
            document_names={"d.pdf": "Doc.pdf"},
            document_structural_counts={"d.pdf": {"references": {"count": 40, "exact": True}}},
            user_email="u@x.com",
        )
    )
    assert "exactly 40 references" in events[1]["value"]


def test_a_page_specific_question_is_never_treated_as_a_whole_document_count():
    """"how many tables are on page 5" names a page -- the detector only knows whole-document
    totals, so this must fall through to the normal page-lookup path, not the bypass."""

    class _PageRetrieval:
        def get_page_context(self, *a, **k):
            return {"context": "", "chunk_count": 0, "missing_pages": [5], "found_pages": []}

        def get_max_indexed_pages(self, *a, **k):
            return {}

    class _StreamingAI:
        async def stream_chat(self, messages):
            yield "ok"

    events = _run(
        ChatService(_PageRetrieval(), _StreamingAI()).stream_response(
            messages=[{"role": "user", "content": "how many tables are on page 5?"}],
            document_ids=["d.pdf"],
            document_names={"d.pdf": "Doc.pdf"},
            document_structural_counts={"d.pdf": {"tables": {"count": 4, "exact": True}}},
            user_email="u@x.com",
        )
    )
    # reached the normal LLM path (the exploding-AI test above proves the bypass never does this)
    assert "".join(e["value"] for e in events if e["type"] == "token") == "ok"


def test_a_research_action_is_never_intercepted_by_the_bypass():
    """The "references" research action is a real listing feature (extract every citation in APA
    + BibTeX) -- structurally different from a bare count, and must keep going through the model."""

    class _ActionRetrieval:
        def get_full_document_context(self, *a, **k):
            return {"context": "[SOURCE: Doc]\nfull text", "truncated": False, "chunk_count": 1, "truncated_sources": []}

        def get_max_indexed_pages(self, *a, **k):
            return {}

    class _StreamingAI:
        async def stream_chat(self, messages):
            yield "ok"

    events = _run(
        ChatService(_ActionRetrieval(), _StreamingAI()).stream_response(
            messages=[{"role": "user", "content": "References"}],
            document_ids=["d.pdf"],
            document_names={"d.pdf": "Doc.pdf"},
            document_structural_counts={"d.pdf": {"references": {"count": 40, "exact": True}}},
            user_email="u@x.com",
            action="references",
        )
    )
    assert "".join(e["value"] for e in events if e["type"] == "token") == "ok"


def test_decide_full_document_does_not_charge_quota_for_a_bypassed_question():
    """The whole-document daily quota must not be spent on a question stream_response never sends
    the whole document (or the LLM) for."""

    class _AI:
        async def classify(self, messages):
            raise AssertionError("classifier should not be called for a bypassed structural-count question")

    result = _run_coro(
        ChatService(retrieval_service=None, ai_service=_AI()).decide_full_document(
            messages=[{"role": "user", "content": "How many references does this document cite in total?"}],
            action=None,
            document_ids=["d.pdf"],
        )
    )
    assert result is False


def _run_coro(coro):
    return asyncio.run(coro)
