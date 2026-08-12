"""Whole-document context for aggregate/counting questions ("how many
questions does it have", "list all the sections") — top-k similarity
retrieval structurally cannot answer these (see chat_service.py's
_AGGREGATE_QUERY_RE), so they bypass it entirely in favour of every ingested
chunk for the document, in original order.

PgVectorStore.get_all_chunks runs against the real (SQLite-backed) test DB —
plain ordered SELECT, no vector math involved. RetrievalService.get_full_document_context's
formatting/truncation logic is tested against a fake vector store instead,
since that logic has nothing to do with the storage backend.
"""

from app.db.models.document_chunk import DocumentChunk
from app.modules.rag.pgvector_store import PgVectorStore
from app.modules.rag.retrieval_service import RetrievalService
from app.tests.conftest import TestingSessionLocal


def _seed_chunk(db, source: str, user_email: str, chunk: int, page: int, content: str):
    db.add(
        DocumentChunk(
            id=f"{source}-{user_email}-{chunk}",
            source=source,
            user_email=user_email,
            chunk=chunk,
            page=page,
            content=content,
            embedding="0",
        )
    )


def test_get_all_chunks_returns_every_chunk_in_document_order(monkeypatch):
    import app.db.session as db_session_module

    monkeypatch.setattr(db_session_module, "SessionLocal", TestingSessionLocal)

    db = TestingSessionLocal()
    try:
        # Inserted out of order on purpose — the query must sort them, not
        # rely on insertion order.
        _seed_chunk(db, "doc.pdf", "u@example.com", chunk=2, page=2, content="third")
        _seed_chunk(db, "doc.pdf", "u@example.com", chunk=0, page=1, content="first")
        _seed_chunk(db, "doc.pdf", "u@example.com", chunk=1, page=1, content="second")
        db.commit()

        store = PgVectorStore()
        chunks = store.get_all_chunks(["doc.pdf"], user_email="u@example.com")

        assert [c["content"] for c in chunks] == ["first", "second", "third"]
    finally:
        db.query(DocumentChunk).filter(DocumentChunk.source == "doc.pdf").delete(synchronize_session=False)
        db.commit()
        db.close()


def test_get_all_chunks_scoped_to_user_email(monkeypatch):
    import app.db.session as db_session_module

    monkeypatch.setattr(db_session_module, "SessionLocal", TestingSessionLocal)

    db = TestingSessionLocal()
    try:
        _seed_chunk(db, "shared.pdf", "owner@example.com", chunk=0, page=1, content="mine")
        _seed_chunk(db, "shared.pdf", "someone-else@example.com", chunk=0, page=1, content="not mine")
        db.commit()

        store = PgVectorStore()
        chunks = store.get_all_chunks(["shared.pdf"], user_email="owner@example.com")

        assert [c["content"] for c in chunks] == ["mine"]
    finally:
        db.query(DocumentChunk).filter(DocumentChunk.source == "shared.pdf").delete(synchronize_session=False)
        db.commit()
        db.close()


def test_get_all_chunks_empty_source_ids_returns_empty_list():
    store = PgVectorStore()
    assert store.get_all_chunks([]) == []


class FakeVectorStore:
    def __init__(self, chunks):
        self._chunks = chunks

    def get_all_chunks(self, source_ids, user_email=""):
        return self._chunks


class FakeEmbeddingService:
    def embed_query(self, query):
        return [0.0]


def test_full_document_context_concatenates_with_source_and_page_labels():
    chunks = [
        {"source": "uuid-a.pdf", "page": 1, "chunk": 0, "content": "Q1) First question"},
        {"source": "uuid-a.pdf", "page": 2, "chunk": 1, "content": "Q2) Second question"},
    ]
    service = RetrievalService(embedding_service=FakeEmbeddingService(), vector_store=FakeVectorStore(chunks))

    result = service.get_full_document_context(
        ["uuid-a.pdf"], source_names={"uuid-a.pdf": "Report.pdf"}, max_chars=10_000
    )

    assert result["truncated"] is False
    assert result["chunk_count"] == 2
    assert "[SOURCE: Report.pdf | PAGE: 1]\nQ1) First question" in result["context"]
    assert "[SOURCE: Report.pdf | PAGE: 2]\nQ2) Second question" in result["context"]
    # The display name is resolved — the raw stored-filename id must not appear.
    assert "uuid-a.pdf" not in result["context"]


def test_full_document_context_truncates_at_max_chars():
    chunks = [
        {"source": "a.pdf", "page": i, "chunk": i, "content": "x" * 100}
        for i in range(1, 11)  # 10 chunks x ~110 chars formatted each = ~1100 chars total
    ]
    service = RetrievalService(embedding_service=FakeEmbeddingService(), vector_store=FakeVectorStore(chunks))

    result = service.get_full_document_context(["a.pdf"], max_chars=300)

    assert result["truncated"] is True
    assert result["chunk_count"] < 10
    assert len(result["context"]) <= 300 + 50  # a little slack for the last accepted piece's own length


def test_full_document_context_empty_when_no_chunks():
    service = RetrievalService(embedding_service=FakeEmbeddingService(), vector_store=FakeVectorStore([]))
    result = service.get_full_document_context(["a.pdf"])
    assert result == {"context": "", "truncated": False, "chunk_count": 0}
