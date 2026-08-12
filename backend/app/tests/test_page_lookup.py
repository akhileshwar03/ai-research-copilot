"""Exact page-number lookup for "what's on page N" questions — top-k
similarity retrieval structurally cannot answer these (see chat_service.py's
_PAGE_QUERY_RE): a page number carries no semantic meaning to match on, so
the returned chunks weren't reliably from the requested page at all. This is
the direct fix for a live-reproduced bug where the assistant produced a
self-contradictory citation ("page 22 excerpt, but indicated as part of the
content around page 25").

PgVectorStore.get_chunks_by_pages runs against the real (SQLite-backed) test
DB — a plain filtered SELECT, no vector math. RetrievalService.get_page_context's
formatting is tested against a fake vector store instead.

Both accept a *list* of pages (not a single page) so multi-page questions
("compare page 3 and page 8") aren't silently answered from only the first
page mentioned — see the found_pages/missing_pages reporting tested below.
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


def test_get_chunks_by_pages_returns_only_the_exact_pages(monkeypatch):
    import app.db.session as db_session_module

    monkeypatch.setattr(db_session_module, "SessionLocal", TestingSessionLocal)

    db = TestingSessionLocal()
    try:
        _seed_chunk(db, "doc.pdf", "u@example.com", chunk=0, page=24, content="page 24 content")
        _seed_chunk(db, "doc.pdf", "u@example.com", chunk=1, page=25, content="Q24) first on 25")
        _seed_chunk(db, "doc.pdf", "u@example.com", chunk=2, page=25, content="Q25) second on 25")
        _seed_chunk(db, "doc.pdf", "u@example.com", chunk=3, page=26, content="page 26 content")
        db.commit()

        store = PgVectorStore()
        chunks = store.get_chunks_by_pages(["doc.pdf"], pages=[25], user_email="u@example.com")

        assert [c["content"] for c in chunks] == ["Q24) first on 25", "Q25) second on 25"]
        assert all(c["page"] == 25 for c in chunks)
    finally:
        db.query(DocumentChunk).filter(DocumentChunk.source == "doc.pdf").delete(synchronize_session=False)
        db.commit()
        db.close()


def test_get_chunks_by_pages_supports_multiple_pages_in_one_query(monkeypatch):
    import app.db.session as db_session_module

    monkeypatch.setattr(db_session_module, "SessionLocal", TestingSessionLocal)

    db = TestingSessionLocal()
    try:
        _seed_chunk(db, "doc.pdf", "u@example.com", chunk=0, page=3, content="page 3 content")
        _seed_chunk(db, "doc.pdf", "u@example.com", chunk=1, page=8, content="page 8 content")
        _seed_chunk(db, "doc.pdf", "u@example.com", chunk=2, page=15, content="page 15 content")
        db.commit()

        store = PgVectorStore()
        chunks = store.get_chunks_by_pages(["doc.pdf"], pages=[3, 8], user_email="u@example.com")

        assert {c["content"] for c in chunks} == {"page 3 content", "page 8 content"}
    finally:
        db.query(DocumentChunk).filter(DocumentChunk.source == "doc.pdf").delete(synchronize_session=False)
        db.commit()
        db.close()


def test_get_chunks_by_pages_scoped_to_user_email(monkeypatch):
    import app.db.session as db_session_module

    monkeypatch.setattr(db_session_module, "SessionLocal", TestingSessionLocal)

    db = TestingSessionLocal()
    try:
        _seed_chunk(db, "shared.pdf", "owner@example.com", chunk=0, page=5, content="mine")
        _seed_chunk(db, "shared.pdf", "someone-else@example.com", chunk=0, page=5, content="not mine")
        db.commit()

        store = PgVectorStore()
        chunks = store.get_chunks_by_pages(["shared.pdf"], pages=[5], user_email="owner@example.com")

        assert [c["content"] for c in chunks] == ["mine"]
    finally:
        db.query(DocumentChunk).filter(DocumentChunk.source == "shared.pdf").delete(synchronize_session=False)
        db.commit()
        db.close()


def test_get_chunks_by_pages_returns_empty_for_a_page_with_no_chunks(monkeypatch):
    import app.db.session as db_session_module

    monkeypatch.setattr(db_session_module, "SessionLocal", TestingSessionLocal)

    db = TestingSessionLocal()
    try:
        _seed_chunk(db, "doc.pdf", "u@example.com", chunk=0, page=1, content="only page 1")
        db.commit()

        store = PgVectorStore()
        chunks = store.get_chunks_by_pages(["doc.pdf"], pages=[99], user_email="u@example.com")

        assert chunks == []
    finally:
        db.query(DocumentChunk).filter(DocumentChunk.source == "doc.pdf").delete(synchronize_session=False)
        db.commit()
        db.close()


def test_get_chunks_by_pages_empty_source_ids_returns_empty_list():
    store = PgVectorStore()
    assert store.get_chunks_by_pages([], pages=[1]) == []


class FakeVectorStore:
    def __init__(self, chunks):
        self._chunks = chunks

    def get_chunks_by_pages(self, source_ids, pages, user_email=""):
        return self._chunks


class FakeEmbeddingService:
    def embed_query(self, query):
        return [0.0]


def test_page_context_formats_with_source_and_page_labels():
    chunks = [
        {"source": "uuid-a.pdf", "page": 25, "chunk": 0, "content": "Q24) ..."},
        {"source": "uuid-a.pdf", "page": 25, "chunk": 1, "content": "Q25) ..."},
    ]
    service = RetrievalService(embedding_service=FakeEmbeddingService(), vector_store=FakeVectorStore(chunks))

    result = service.get_page_context(["uuid-a.pdf"], pages=[25], source_names={"uuid-a.pdf": "Report.pdf"})

    assert result["chunk_count"] == 2
    assert "[SOURCE: Report.pdf | PAGE: 25]\nQ24) ..." in result["context"]
    assert "[SOURCE: Report.pdf | PAGE: 25]\nQ25) ..." in result["context"]
    assert "uuid-a.pdf" not in result["context"]
    assert result["found_pages"] == [25]
    assert result["missing_pages"] == []


def test_page_context_empty_when_no_chunks_on_that_page():
    service = RetrievalService(embedding_service=FakeEmbeddingService(), vector_store=FakeVectorStore([]))
    result = service.get_page_context(["a.pdf"], pages=[99])
    assert result["context"] == ""
    assert result["chunk_count"] == 0
    assert result["found_pages"] == []
    assert result["missing_pages"] == [99]


def test_page_context_reports_missing_pages_in_a_multi_page_query():
    chunks = [{"source": "a.pdf", "page": 3, "chunk": 0, "content": "on page 3"}]
    service = RetrievalService(embedding_service=FakeEmbeddingService(), vector_store=FakeVectorStore(chunks))

    result = service.get_page_context(["a.pdf"], pages=[3, 8])

    assert result["found_pages"] == [3]
    assert result["missing_pages"] == [8]
