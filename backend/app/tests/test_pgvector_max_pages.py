"""PgVectorStore.max_pages: the real, queried page count fed into the chat
system prompt so "how many pages" questions have an honest fact to answer
from, instead of an LLM extrapolating a total from a handful of retrieved
chunks (see chat_service.py's rule 5/7/8 and the incident that prompted
this — a user demonstrating the model changing its "confirmed" answer every
time they asserted a different number).

Runs against the test SQLite DB directly (the `embedding` column falls back
to plain Text there, and max_pages does no vector math — a plain
SELECT max(page) GROUP BY source — so it's fully exercisable without a real
Postgres/pgvector instance).
"""

from app.db.models.document_chunk import DocumentChunk
from app.modules.rag.pgvector_store import PgVectorStore
from app.tests.conftest import TestingSessionLocal


def _seed_chunk(db, source: str, user_email: str, chunk: int, page: int | None):
    # id must be globally unique, not just per (source, chunk) — two users
    # can otherwise legitimately have identically-named/chunked documents.
    db.add(
        DocumentChunk(
            id=f"{source}-{user_email}-{chunk}",
            source=source,
            user_email=user_email,
            chunk=chunk,
            page=page,
            content="text",
            embedding="0",  # SQLite variant stores this as plain Text
        )
    )


def test_max_pages_returns_highest_page_per_source(monkeypatch):
    import app.db.session as db_session_module

    monkeypatch.setattr(db_session_module, "SessionLocal", TestingSessionLocal)

    db = TestingSessionLocal()
    try:
        _seed_chunk(db, "a.pdf", "u@example.com", 0, page=1)
        _seed_chunk(db, "a.pdf", "u@example.com", 1, page=5)
        _seed_chunk(db, "a.pdf", "u@example.com", 2, page=3)
        _seed_chunk(db, "b.pdf", "u@example.com", 0, page=9)
        db.commit()

        store = PgVectorStore()
        result = store.max_pages(["a.pdf", "b.pdf"], user_email="u@example.com")

        assert result == {"a.pdf": 5, "b.pdf": 9}
    finally:
        db.query(DocumentChunk).filter(DocumentChunk.source.in_(["a.pdf", "b.pdf"])).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_max_pages_scoped_to_user_email(monkeypatch):
    """A different user's chunks for a same-named source must never leak in —
    same isolation guarantee as every other retrieval path in this project."""
    import app.db.session as db_session_module

    monkeypatch.setattr(db_session_module, "SessionLocal", TestingSessionLocal)

    db = TestingSessionLocal()
    try:
        _seed_chunk(db, "shared.pdf", "owner@example.com", 0, page=20)
        _seed_chunk(db, "shared.pdf", "someone-else@example.com", 0, page=99)
        db.commit()

        store = PgVectorStore()
        result = store.max_pages(["shared.pdf"], user_email="owner@example.com")

        assert result == {"shared.pdf": 20}
    finally:
        db.query(DocumentChunk).filter(DocumentChunk.source == "shared.pdf").delete(synchronize_session=False)
        db.commit()
        db.close()


def test_max_pages_empty_source_ids_returns_empty_dict():
    store = PgVectorStore()
    assert store.max_pages([]) == {}
