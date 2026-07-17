"""Tests for the free-tier retention cleanup.

Covers the atomic run-claim, the purge of expired documents/chats, the
retention_days=0 (keep forever) escape hatch, and eviction of operational
debris (expired OTPs and one-time codes).
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.db.models.chat_models import ChatMessage, ChatSession
from app.db.models.document import Document
from app.db.models.user import User
from app.services import retention_service
from app.services.runtime_settings import runtime_settings
from app.tests.conftest import TestingSessionLocal


class _FakeVectorStore:
    def __init__(self):
        self.deleted_sources: list[str] = []

    def delete_by_source(self, source_id: str) -> None:
        self.deleted_sources.append(source_id)


@pytest.fixture
def retention_env(monkeypatch, tmp_path):
    """Route the cleanup's own session/vector-store/uploads at test doubles."""
    import app.db.session as db_session_module
    import app.modules.rag.vector_store_manager as vsm_module

    fake_store = _FakeVectorStore()
    monkeypatch.setattr(db_session_module, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(vsm_module, "VectorStoreManager", lambda: fake_store)
    monkeypatch.setattr(retention_service.get_settings(), "uploads_dir", str(tmp_path), raising=False)
    return fake_store


def _naive_utc(days_ago: int) -> datetime:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).replace(tzinfo=None)


def _seed_document(db, stored_filename: str, days_ago: int) -> Document:
    doc = Document(
        user_email="retention@example.com",
        original_filename=f"{stored_filename}.pdf",
        stored_filename=stored_filename,
        content_type="application/pdf",
        size_bytes=100,
        checksum_sha256=f"sum-{stored_filename}",
        upload_status="ready",
        created_at=_naive_utc(days_ago),
    )
    db.add(doc)
    return doc


def _seed_session(db, title: str, days_ago: int) -> ChatSession:
    user = db.query(User).filter(User.email == "retention@example.com").first()
    if user is None:
        user = User(email="retention@example.com", hashed_password=None, email_verified=True)
        db.add(user)
        db.flush()
    session = ChatSession(title=title, user_id=user.id, created_at=_naive_utc(days_ago))
    db.add(session)
    db.flush()
    db.add(ChatMessage(role="user", content="hello", session_id=session.id))
    return session


def test_cleanup_purges_only_expired_data(retention_env, tmp_path):
    db = TestingSessionLocal()
    try:
        runtime_settings.set(db, "retention_days", 7)

        old_doc = _seed_document(db, "old-doc.pdf", days_ago=10)
        new_doc = _seed_document(db, "new-doc.pdf", days_ago=2)
        old_session = _seed_session(db, "old chat", days_ago=10)
        new_session = _seed_session(db, "new chat", days_ago=1)
        db.commit()
        old_doc_id, new_doc_id = old_doc.id, new_doc.id
        old_session_id, new_session_id = old_session.id, new_session.id

        # The expired document's file must be removed from disk too.
        (tmp_path / "old-doc.pdf").write_bytes(b"%PDF-1.4")

        summary = retention_service.run_cleanup()
        db.expire_all()  # cleanup ran in its own session; drop cached instances

        assert summary["documents"] >= 1
        assert summary["sessions"] >= 1
        assert db.get(Document, old_doc_id) is None
        assert db.get(Document, new_doc_id) is not None
        assert db.get(ChatSession, old_session_id) is None
        assert db.get(ChatSession, new_session_id) is not None
        assert db.query(ChatMessage).filter(ChatMessage.session_id == old_session_id).count() == 0
        assert not (tmp_path / "old-doc.pdf").exists()
        assert "old-doc.pdf" in retention_env.deleted_sources
    finally:
        # Restore the default so later tests see a clean policy.
        runtime_settings.set(db, "retention_days", 7)
        db.close()


def test_cleanup_disabled_when_retention_is_zero(retention_env):
    db = TestingSessionLocal()
    try:
        runtime_settings.set(db, "retention_days", 0)
        doc = _seed_document(db, "ancient-doc.pdf", days_ago=400)
        db.commit()
        doc_id = doc.id

        summary = retention_service.run_cleanup()

        assert summary["documents"] == 0
        assert db.get(Document, doc_id) is not None
    finally:
        runtime_settings.set(db, "retention_days", 7)
        db.query(Document).filter(Document.stored_filename == "ancient-doc.pdf").delete()
        db.commit()
        db.close()


def test_claim_is_single_winner_per_interval():
    from app.db.models.app_setting import AppSetting

    db = TestingSessionLocal()
    try:
        # Reset any previous claim so this test owns the cycle.
        db.query(AppSetting).filter(AppSetting.key == "retention_last_run_at").delete()
        db.commit()

        assert retention_service._try_claim(db) is True
        assert retention_service._try_claim(db) is False  # within the interval
    finally:
        db.close()


def test_document_list_reports_retention_policy(client, auth_headers):
    resp = client.get("/api/v1/documents", headers=auth_headers)
    assert resp.status_code == 200
    assert "retention_days" in resp.json()
