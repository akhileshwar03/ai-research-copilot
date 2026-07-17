"""Unit tests for repositories and services using an isolated in-memory database."""

from datetime import datetime, timedelta, timezone

from app.core.security import hash_password, hash_token
from app.db.repositories.document_repository import DocumentRepository
from app.db.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService


def test_user_repository_refresh_token_flow(db_session):
    repo = UserRepository(db_session)
    email = f"repo-test-{int(datetime.now().timestamp())}@example.com"
    user = repo.create(email=email, hashed_password=hash_password("StrongPass1"))
    repo.create_identity(user.id, "password", email, email)
    token_hash = hash_token("sample-token")
    repo.create_refresh_token(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    )
    db_session.commit()

    stored = repo.get_refresh_token(token_hash)
    assert stored is not None
    assert stored.revoked is False

    repo.revoke_refresh_token(stored)
    db_session.commit()
    assert stored.revoked is True


def test_document_repository_dedup_lookup(db_session):
    repo = DocumentRepository(db_session)
    checksum = f"abc-{int(datetime.now().timestamp())}"
    repo.create(
        original_filename="a.pdf",
        stored_filename=f"{checksum}.pdf",
        content_type="application/pdf",
        size_bytes=123,
        checksum_sha256=checksum,
        upload_status="ready",
    )
    db_session.commit()

    doc = repo.get_by_checksum(checksum)
    assert doc is not None
    assert doc.stored_filename == f"{checksum}.pdf"


def test_document_repository_pagination(db_session):
    repo = DocumentRepository(db_session)
    email = "paginate@example.com"
    for i in range(5):
        checksum = f"checksum-page-{i}"
        repo.create(
            original_filename=f"doc{i}.pdf",
            stored_filename=f"{checksum}.pdf",
            content_type="application/pdf",
            size_bytes=100,
            checksum_sha256=checksum,
            user_email=email,
        )
    db_session.commit()

    page1 = repo.list_by_user(email, skip=0, limit=3)
    page2 = repo.list_by_user(email, skip=3, limit=3)
    total = repo.count_by_user(email)

    assert len(page1) == 3
    assert len(page2) == 2
    assert total == 5


def test_auth_service_login_returns_access_and_refresh_tokens(db_session, unique_email):
    repo = UserRepository(db_session)
    repo.create(email=unique_email, hashed_password=hash_password("StrongPass1"))
    db_session.commit()

    service = AuthService(user_repo=repo)
    response = service.login(unique_email, "StrongPass1")
    assert "token" in response
    assert "access_token" in response
    assert "refresh_token" in response


def test_auth_service_rejects_weak_password(db_session):
    repo = UserRepository(db_session)
    service = AuthService(user_repo=repo)

    from app.core.exceptions import AppError
    import pytest

    with pytest.raises(AppError) as exc_info:
        service.register("weak@example.com", "abc")
    assert exc_info.value.code == "WEAK_PASSWORD"
