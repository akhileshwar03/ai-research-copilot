""""Which of my documents talks about X" -- flagged as unsolved in the 2026-09-27 eval notes:
plain top-k retrieval, run once across all selected documents together, silently starves out any
document whose chunks don't win that single global similarity race, and gives the model zero
signal about documents it found nothing relevant in. RetrievalService.retrieve_context_for_
document_coverage fetches a small, independent sample from EVERY selected document instead, and
chat_service routes this specific question shape to it.
"""

import asyncio
import time

from app.services.chat_service import ChatService, _looks_like_cross_document_query
from app.modules.rag.retrieval_service import RetrievalService


def _run(coro):
    return asyncio.run(coro)


# --- intent detection -----------------------------------------------------------------------

_POSITIVES = [
    "Which of my documents talks about attention mechanisms?",
    "Which document covers the CNN architecture?",
    "Do any of my documents mention transfer learning?",
    "Which of these papers discusses transformer models?",
    "Does either document talk about GANs?",
    "Which one covers regularization?",
    "Which file has the pricing section?",
    "Are any of the documents discussing GDPR compliance?",
    "Which paper contains the ablation study?",
    "Does each document mention transfer learning?",
]

_NEGATIVES = [
    "Which page discusses the vanishing gradient problem?",
    "What does the document say about CNNs?",
    "How many references does this document cite?",
    "What is the abstract about?",
    "Which section talks about pooling layers?",
    "Summarize the key findings",
    "What model was used for training?",
    "Compare the two approaches",
    "Do you have access to my documents?",
    "What are my documents about?",
    "Does the document mention transfer learning?",
    "Which model performed best?",
    "Which experiment showed the best results?",
]


def test_positive_phrasings_are_detected():
    for q in _POSITIVES:
        assert _looks_like_cross_document_query(q), f"should have matched: {q!r}"


def test_negative_phrasings_are_not_detected():
    for q in _NEGATIVES:
        assert not _looks_like_cross_document_query(q), f"should NOT have matched: {q!r}"


# --- RetrievalService.retrieve_context_for_document_coverage --------------------------------


class _FakeEmbedding:
    def embed_query(self, query):
        return [0.0]


class _PerDocVectorStore:
    """Each source has its own canned chunk (or none, for a document with nothing relevant)."""

    def __init__(self, content_by_source: dict[str, str | None], delay_s: float = 0.0):
        self.content_by_source = content_by_source
        self.delay_s = delay_s
        self.queries: list[dict] = []

    def query(self, query_embedding, n_results, where=None):
        if self.delay_s:
            time.sleep(self.delay_s)
        # where is {"$and": [{"user_email": ...}, {"source": {"$in": [single_id]}}]}
        source_id = where["$and"][1]["source"]["$in"][0]
        self.queries.append(where)
        content = self.content_by_source.get(source_id)
        if content is None:
            return {"documents": [[]], "metadatas": [[]], "distances": [[]]}
        return {"documents": [[content]], "metadatas": [[{"source": source_id, "page": 1}]], "distances": [[0.1]]}


def test_every_selected_document_gets_its_own_independent_sample():
    store = _PerDocVectorStore({"a.pdf": "A discusses attention mechanisms in depth.", "b.pdf": "B is about cooking recipes."})
    service = RetrievalService(_FakeEmbedding(), store)
    result = _run(
        service.retrieve_context_for_document_coverage(
            "attention mechanisms",
            source_ids=["a.pdf", "b.pdf"],
            user_email="u@x.com",
            source_names={"a.pdf": "A.pdf", "b.pdf": "B.pdf"},
        )
    )
    # both documents were genuinely queried independently -- not just whichever won a combined search
    assert len(store.queries) == 2
    assert "attention mechanisms in depth" in result["context"]
    assert "cooking recipes" in result["context"]
    assert result["sources"] == ["a.pdf", "b.pdf"]
    assert result["no_match_sources"] == []


def test_a_document_with_nothing_relevant_is_named_as_a_real_negative_not_silently_dropped():
    store = _PerDocVectorStore({"a.pdf": "A discusses attention mechanisms in depth.", "b.pdf": None})
    service = RetrievalService(_FakeEmbedding(), store)
    result = _run(
        service.retrieve_context_for_document_coverage(
            "attention mechanisms",
            source_ids=["a.pdf", "b.pdf"],
            user_email="u@x.com",
            source_names={"a.pdf": "A.pdf", "b.pdf": "B.pdf"},
        )
    )
    assert result["sources"] == ["a.pdf"]
    assert result["no_match_sources"] == ["b.pdf"]
    # the negative result is stated explicitly in the context the model sees, by real name
    assert "B.pdf" in result["context"]
    assert "No closely-matching content" in result["context"]


def test_documents_are_queried_concurrently_not_one_after_another():
    """Real per-document fan-out cost/latency concern: N documents must not mean N times the
    wall-clock time of a single lookup."""
    n_docs = 5
    per_query_delay = 0.05
    store = _PerDocVectorStore({f"doc{i}.pdf": f"content {i}" for i in range(n_docs)}, delay_s=per_query_delay)
    service = RetrievalService(_FakeEmbedding(), store)
    t0 = time.monotonic()
    _run(
        service.retrieve_context_for_document_coverage(
            "q", source_ids=[f"doc{i}.pdf" for i in range(n_docs)], user_email="u@x.com"
        )
    )
    elapsed = time.monotonic() - t0
    # sequential would take n_docs * per_query_delay (~0.25s); concurrent stays near one delay
    assert elapsed < per_query_delay * 2, f"looks sequential, not concurrent (elapsed={elapsed:.3f}s)"


def test_the_document_cap_bounds_worst_case_fan_out():
    many_docs = [f"doc{i}.pdf" for i in range(30)]
    store = _PerDocVectorStore({d: "content" for d in many_docs})
    service = RetrievalService(_FakeEmbedding(), store)
    _run(service.retrieve_context_for_document_coverage("q", source_ids=many_docs, user_email="u@x.com"))
    assert len(store.queries) == RetrievalService._COVERAGE_MAX_DOCUMENTS


# --- chat_service.stream_response routing ----------------------------------------------------


class _CoverageRetrieval:
    def __init__(self):
        self.called_with = None

    async def retrieve_context_for_document_coverage(self, query, source_ids, user_email="", source_names=None):
        self.called_with = {"query": query, "source_ids": source_ids}
        return {"context": "[SOURCE: A.pdf]\ncovers it\n\n[SOURCE: B.pdf]\nno match", "sources": ["a.pdf"], "no_match_sources": ["b.pdf"]}

    def get_max_indexed_pages(self, *a, **k):
        return {}

    async def retrieve_context(self, *a, **k):
        raise AssertionError("plain retrieve_context should not be called for a cross-document question")

    def get_full_document_context(self, *a, **k):
        raise AssertionError("get_full_document_context should not be called for a cross-document question")


class _AI:
    last = None

    async def stream_chat(self, messages):
        _AI.last = messages
        yield "ok"

    async def classify(self, messages):
        raise AssertionError("classify (the WHOLE/LOOKUP router) should not be called for a cross-document question")


def test_stream_response_routes_a_multi_document_coverage_question_to_the_new_mode():
    retrieval = _CoverageRetrieval()

    async def collect():
        return [
            e
            async for e in ChatService(retrieval, _AI()).stream_response(
                messages=[{"role": "user", "content": "Which of my documents talks about attention mechanisms?"}],
                document_ids=["a.pdf", "b.pdf"],
                document_names={"a.pdf": "A.pdf", "b.pdf": "B.pdf"},
                user_email="u@x.com",
            )
        ]

    events = asyncio.run(collect())
    assert retrieval.called_with is not None
    assert retrieval.called_with["source_ids"] == ["a.pdf", "b.pdf"]
    system_prompt = _AI.last[0][1]
    assert "CROSS-DOCUMENT COVERAGE SCAN" in system_prompt
    assert events[0] == {"type": "sources", "sources": ["a.pdf"]}


def test_a_single_selected_document_falls_through_to_ordinary_retrieval():
    """The same phrasing with only one document selected has nothing to "fan out" across --
    must behave as an ordinary lookup, not take the coverage path."""

    class _SingleDocRetrieval:
        async def retrieve_context_for_document_coverage(self, *a, **k):
            raise AssertionError("must not be called with only one document selected")

        def get_max_indexed_pages(self, *a, **k):
            return {}

        async def retrieve_context(self, query, **k):
            return {"context": "[SOURCE: A.pdf]\nsome content", "sources": ["a.pdf"]}

    async def collect():
        return [
            e
            async for e in ChatService(_SingleDocRetrieval(), _AI()).stream_response(
                messages=[{"role": "user", "content": "Which of my documents talks about attention mechanisms?"}],
                document_ids=["a.pdf"],
                document_names={"a.pdf": "A.pdf"},
                user_email="u@x.com",
            )
        ]

    asyncio.run(collect())  # must not raise


def test_decide_full_document_does_not_charge_quota_for_a_coverage_question():
    class _AIRaises:
        async def classify(self, messages):
            raise AssertionError("classifier should not be called for a cross-document coverage question")

    result = asyncio.run(
        ChatService(retrieval_service=None, ai_service=_AIRaises()).decide_full_document(
            messages=[{"role": "user", "content": "Which of my documents talks about attention mechanisms?"}],
            action=None,
            document_ids=["a.pdf", "b.pdf"],
        )
    )
    assert result is False
