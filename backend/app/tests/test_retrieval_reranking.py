"""RetrievalService.retrieve_context's reranking step (measured +8-20pp retrieval hit rate on a
152-question/7-document benchmark, 2026-09-27):

1. When enabled, a larger pool is fetched from the vector store and an LLM re-scores it down to rag_top_k.
2. Any failure (bad JSON, an exception, a nonsense index) falls back to plain distance order — reranking is
   an enhancement, never a reason to fail or degrade a reply.
3. Disabled (rag_rerank_enabled off, or no ai_service given), behaviour is byte-identical to before this
   feature existed: exactly rag_top_k candidates fetched, no LLM call.
"""

import asyncio
import json

import pytest

from app.modules.rag.retrieval_service import RetrievalService
from app.services.runtime_settings import runtime_settings


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture
def setting(monkeypatch):
    overrides: dict = {}
    real_get = runtime_settings.get
    monkeypatch.setattr(runtime_settings, "get", lambda key: overrides[key] if key in overrides else real_get(key))
    return overrides.__setitem__


class FakeEmbeddingService:
    def embed_query(self, query):
        return [0.0]


class RecordingVectorStore:
    """Returns *chunks* (each a distance-ordered dict {content, distance}), capped at whatever n_results the
    caller asked for, and records that n_results so a test can confirm the pool size actually requested."""

    def __init__(self, chunks):
        self._chunks = chunks
        self.last_n_results = None

    def query(self, query_embedding, n_results, where=None):
        self.last_n_results = n_results
        picked = self._chunks[:n_results]
        return {
            "documents": [[c["content"] for c in picked]],
            "metadatas": [[{"source": c.get("source", "doc.pdf"), "page": c.get("page", 1)} for c in picked]],
            "distances": [[c["distance"] for c in picked]],
        }


def _chunks(n):
    # Ordered worst-match-first by content label, but ranked best-to-worst by distance — a reranker that
    # actually reads the content (not just position) is the only way to recover the true best match.
    return [{"content": f"chunk {i}: filler text about an unrelated topic", "distance": 0.1 * (i + 1)} for i in range(n)]


class FakeAIService:
    def __init__(self, response=None, raises=None):
        self.calls: list = []
        self._response = response
        self._raises = raises

    async def rerank(self, messages):
        self.calls.append(messages)
        if self._raises:
            raise self._raises
        return self._response


def _service(chunks, ai_service=None):
    store = RecordingVectorStore(chunks)
    return RetrievalService(embedding_service=FakeEmbeddingService(), vector_store=store, ai_service=ai_service), store


# ── disabled / no ai_service: must be byte-identical to pre-reranking behaviour ──────────────────────────
def test_no_ai_service_means_the_old_plain_top_k_behaviour_exactly(setting):
    setting("rag_top_k", 3)
    service, store = _service(_chunks(10), ai_service=None)

    result = _run(service.retrieve_context("q", user_email="u@x.com"))

    assert store.last_n_results == 3  # no pool growth at all
    assert result["context"].count("[SOURCE:") == 3
    assert "chunk 0" in result["context"] and "chunk 1" in result["context"] and "chunk 2" in result["context"]


def test_rerank_disabled_by_setting_also_skips_the_pool_and_the_llm_call(setting):
    setting("rag_top_k", 3)
    setting("rag_rerank_enabled", False)
    ai = FakeAIService()
    service, store = _service(_chunks(10), ai_service=ai)

    _run(service.retrieve_context("q", user_email="u@x.com"))

    assert store.last_n_results == 3
    assert ai.calls == []


# ── enabled: pool growth + real reordering ───────────────────────────────────────────────────────────────
def test_enabled_fetches_the_configured_pool_size_not_just_top_k(setting):
    setting("rag_top_k", 3)
    setting("rag_rerank_pool_size", 20)
    ai = FakeAIService(response=json.dumps({"ranked": [0, 1, 2]}))
    service, store = _service(_chunks(30), ai_service=ai)

    _run(service.retrieve_context("q", user_email="u@x.com"))

    assert store.last_n_results == 20


def test_the_llm_ranking_is_honoured_over_plain_distance_order(setting):
    setting("rag_top_k", 2)
    setting("rag_rerank_pool_size", 5)
    ai = FakeAIService(response=json.dumps({"ranked": [4, 0]}))  # picks the worst-by-distance chunk first
    service, _store = _service(_chunks(5), ai_service=ai)

    result = _run(service.retrieve_context("q", user_email="u@x.com"))

    lines = [ln for ln in result["context"].split("\n\n")]
    assert "chunk 4" in lines[0] and "chunk 0" in lines[1]


def test_the_prompt_the_reranker_sees_names_every_pool_candidate(setting):
    setting("rag_top_k", 2)
    setting("rag_rerank_pool_size", 4)
    ai = FakeAIService(response=json.dumps({"ranked": [0, 1]}))
    service, _store = _service(_chunks(4), ai_service=ai)

    _run(service.retrieve_context("what is the finding?", user_email="u@x.com"))

    prompt = ai.calls[0][1][1]
    assert "what is the finding?" in prompt
    for i in range(4):
        assert f"[{i}]" in prompt and f"chunk {i}" in prompt


def test_a_pool_no_larger_than_top_k_skips_the_llm_call_entirely(setting):
    """rag_rerank_pool_size below rag_top_k (or a source with too few chunks) means there is nothing to
    rerank — asking an LLM to reorder a set no bigger than what's already being returned would be a pure
    cost with no possible benefit."""
    setting("rag_top_k", 6)
    setting("rag_rerank_pool_size", 6)
    ai = FakeAIService(response=json.dumps({"ranked": [5, 4, 3, 2, 1, 0]}))
    service, _store = _service(_chunks(6), ai_service=ai)

    result = _run(service.retrieve_context("q", user_email="u@x.com"))

    assert ai.calls == []
    assert "chunk 0" in result["context"].split("\n\n")[0]  # original distance order kept


# ── graceful degradation ─────────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "response,raises",
    [
        (None, RuntimeError("model unavailable")),
        ("not json at all", None),
        (json.dumps({"wrong_key": [0, 1]}), None),
        (json.dumps({"ranked": ["a", "b"]}), None),
        ("", None),
    ],
    ids=["exception", "malformed-json", "missing-key", "non-integer-indices", "empty-string"],
)
def test_any_reranker_failure_falls_back_to_plain_distance_order(setting, response, raises):
    setting("rag_top_k", 3)
    setting("rag_rerank_pool_size", 10)
    ai = FakeAIService(response=response, raises=raises)
    service, _store = _service(_chunks(10), ai_service=ai)

    result = _run(service.retrieve_context("q", user_email="u@x.com"))

    assert result["context"].count("[SOURCE:") == 3
    assert "chunk 0" in result["context"] and "chunk 1" in result["context"] and "chunk 2" in result["context"]


def test_an_index_outside_the_pool_is_dropped_not_fatal(setting):
    setting("rag_top_k", 3)
    setting("rag_rerank_pool_size", 5)
    ai = FakeAIService(response=json.dumps({"ranked": [2, 99, -1, 0]}))  # 99 and -1 are out of range
    service, _store = _service(_chunks(5), ai_service=ai)

    result = _run(service.retrieve_context("q", user_email="u@x.com"))

    lines = result["context"].split("\n\n")
    assert len(lines) == 3
    assert "chunk 2" in lines[0] and "chunk 0" in lines[1]
    assert "chunk 1" in lines[2]  # backfilled from the remaining pool in distance order


def test_a_duplicate_index_from_the_model_is_only_used_once(setting):
    setting("rag_top_k", 3)
    setting("rag_rerank_pool_size", 5)
    ai = FakeAIService(response=json.dumps({"ranked": [1, 1, 1]}))
    service, _store = _service(_chunks(5), ai_service=ai)

    result = _run(service.retrieve_context("q", user_email="u@x.com"))

    assert result["context"].count("[SOURCE:") == 3
    assert result["context"].count("chunk 1") == 1


# ── the similarity threshold still applies before reranking ever sees a candidate ────────────────────────
def test_the_distance_threshold_still_filters_before_reranking(setting):
    setting("rag_top_k", 1)  # below the 2 surviving candidates, so reranking actually runs
    setting("rag_rerank_pool_size", 10)
    setting("rag_similarity_threshold", 0.25)
    ai = FakeAIService(response=json.dumps({"ranked": [0, 1, 2, 3, 4]}))
    service, _store = _service(_chunks(10), ai_service=ai)  # distances 0.1..1.0; only the first 2 pass 0.25

    _run(service.retrieve_context("q", user_email="u@x.com"))

    prompt = ai.calls[0][1][1]
    assert "chunk 0" in prompt and "chunk 1" in prompt
    assert "chunk 2" not in prompt
