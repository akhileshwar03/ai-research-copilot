from datetime import datetime, timedelta, timezone

from app.core.security import hash_password, hash_token
from app.db.repositories.document_repository import DocumentRepository
from app.db.repositories.user_repository import UserRepository
from app.db.session import SessionLocal
from app.services.auth_service import AuthService


def test_user_repository_refresh_token_flow():
    db = SessionLocal()
    try:
        repo = UserRepository(db)
        email = f"repo-test-{int(datetime.now().timestamp())}@example.com"
        user = repo.create(email=email, hashed_password=hash_password("Password123"))
        repo.create_identity(user.id, "password", email, email)
        token_hash = hash_token("sample-token")
        repo.create_refresh_token(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
        db.commit()

        stored = repo.get_refresh_token(token_hash)
        assert stored is not None
        assert stored.revoked is False

        repo.revoke_refresh_token(stored)
        db.commit()
        assert stored.revoked is True
    finally:
        db.close()


def test_document_repository_dedup_lookup():
    db = SessionLocal()
    try:
        repo = DocumentRepository(db)
        checksum = f"abc-{int(datetime.now().timestamp())}"
        repo.create(
            original_filename="a.pdf",
            stored_filename=f"{checksum}.pdf",
            content_type="application/pdf",
            size_bytes=123,
            checksum_sha256=checksum,
            upload_status="ready",
        )
        db.commit()

        doc = repo.get_by_checksum(checksum)
        assert doc is not None
        assert doc.stored_filename == f"{checksum}.pdf"
    finally:
        db.close()


def test_auth_service_login_returns_access_and_refresh_tokens(unique_email):
    db = SessionLocal()
    try:
        repo = UserRepository(db)
        repo.create(email=unique_email, hashed_password=hash_password("StrongPass123"))
        db.commit()

        service = AuthService(user_repo=repo)
        response = service.login(unique_email, "StrongPass123")
        assert "token" in response
        assert "access_token" in response
        assert "refresh_token" in response
    finally:
        db.close()
