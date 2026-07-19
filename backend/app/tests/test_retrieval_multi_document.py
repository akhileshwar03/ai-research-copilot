"""Multi-document retrieval: the `where` clause sent to the vector store
must use `$in` when a session is scoped to more than one document, and
still combine correctly with the always-present user_email scope.
"""
from app.modules.rag.retrieval_service import RetrievalService


class FakeEmbeddingService:
    def embed_query(self, query: str) -> list[float]:
        return [0.0]


class RecordingVectorStore:
    def __init__(self):
        self.last_where = "NOT_CALLED"

    def query(self, query_embedding, n_results, where=None):
        self.last_where = where
        return {"documents": [[]], "metadatas": [[]], "distances": [[]]}


def _make_service():
    vector_store = RecordingVectorStore()
    service = RetrievalService(embedding_service=FakeEmbeddingService(), vector_store=vector_store)
    return service, vector_store


def test_no_source_ids_scopes_to_user_only():
    service, store = _make_service()
    service.retrieve_context("q", source_ids=None, user_email="a@example.com")
    assert store.last_where == {"user_email": "a@example.com"}


def test_single_source_id_uses_in_filter():
    service, store = _make_service()
    service.retrieve_context("q", source_ids=["doc-a.pdf"], user_email="a@example.com")
    assert store.last_where == {"$and": [{"user_email": "a@example.com"}, {"source": {"$in": ["doc-a.pdf"]}}]}


def test_multiple_source_ids_uses_in_filter():
    service, store = _make_service()
    service.retrieve_context("q", source_ids=["doc-a.pdf", "doc-b.pdf", "doc-c.pdf"], user_email="a@example.com")
    assert store.last_where == {
        "$and": [{"user_email": "a@example.com"}, {"source": {"$in": ["doc-a.pdf", "doc-b.pdf", "doc-c.pdf"]}}]
    }


def test_empty_source_ids_list_treated_as_none():
    service, store = _make_service()
    service.retrieve_context("q", source_ids=[], user_email="a@example.com")
    assert store.last_where == {"user_email": "a@example.com"}
