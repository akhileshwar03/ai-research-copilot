import logging
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.security import create_access_token, create_refresh_token, decode_refresh_token, hash_token
from app.db.repositories.user_repository import UserRepository
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)


class AuthService:
    """Token issuance/lifecycle for the two sign-in paths this app has: OTP
    (see OtpService.verify_otp, which creates the user) and OAuth (below).
    There is no password-based auth — no register/login/change-password."""

    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo
        self.settings = get_settings()

    def login_or_create_oauth_user(self, email: str, provider: str, provider_subject: str) -> dict:
        """Find or create a user via OAuth, issue tokens."""
        from datetime import timedelta
        user = self.user_repo.get_by_email(email)
        is_new = False
        if not user:
            if not bool(runtime_settings.get("signups_enabled")):
                raise AppError(
                    code="SIGNUPS_DISABLED",
                    message="New sign-ups are currently closed.",
                    status_code=403,
                )
            is_new = True
            user = self.user_repo.create(email=email, hashed_password=None, email_verified=True)
        elif not user.email_verified:
            # Mark verified via OAuth
            user.email_verified = True

        # Upsert OAuth identity
        identity = next(
            (i for i in user.identities if i.provider == provider and i.provider_subject == provider_subject),
            None,
        )
        if not identity:
            self.user_repo.create_identity(
                user_id=user.id, provider=provider, provider_subject=provider_subject, email=email,
            )

        access_token = create_access_token(subject=user.email)
        refresh_token = create_refresh_token(subject=user.email)
        expires_at = datetime.now(timezone.utc) + timedelta(days=self.settings.refresh_token_expire_days)
        self.user_repo.create_refresh_token(
            user_id=user.id, token_hash=hash_token(refresh_token), expires_at=expires_at,
        )
        self.user_repo.db.commit()
        logger.info("oauth_login email=%s provider=%s new=%s", email, provider, is_new)
        return {
            "token": access_token,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "is_new_user": is_new,
        }

    def delete_account(self, email: str) -> dict:
        """Permanently delete a user account and ALL associated data.

        Order:
        1. Remove uploaded PDF files from storage + vectors from the vector store
        2. Delete DB document rows
        3. Delete chat sessions (cascade → chat messages)
        4. Delete the user row (cascade → identities, refresh tokens)
        """
        from app.api.dependencies.services import get_vector_store_manager
        from app.core.config import get_settings
        from app.db.models.chat_models import ChatMessage, ChatSession
        from app.db.models.document import Document
        from app.db.models.humanizer_run import HumanizerRun
        from app.db.models.realtime_models import RealtimeMessage, RealtimeSession
        from app.db.models.usage_event import UsageEvent
        from app.db.repositories.document_repository import DocumentRepository
        from app.services.storage_service import get_storage_service

        user = self.user_repo.get_by_email(email)
        if not user:
            raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)

        db = self.user_repo.db
        settings = get_settings()

        # 1. Purge each document's file and vector embeddings before removing DB rows
        docs = DocumentRepository(db).list_by_user(email)
        if docs:
            storage = get_storage_service()
            vector_store = get_vector_store_manager()
            for doc in docs:
                try:
                    storage.delete(doc.stored_filename)
                except Exception:
                    logger.exception("delete_account: failed to remove file %s", doc.stored_filename)
                try:
                    vector_store.delete_by_source(doc.stored_filename)
                except Exception:
                    logger.exception("delete_account: failed to remove vectors for %s", doc.stored_filename)

        # 2. Delete document DB rows
        db.query(Document).filter(Document.user_email == email).delete(synchronize_session=False)

        # 3. Delete chat messages, then their sessions. `ChatSession.messages`
        #    declares `cascade="all, delete"`, but that only fires for
        #    ORM-tracked object deletion (`db.delete(session_obj)`) — a bulk
        #    `Query.delete()` bypasses the unit-of-work entirely, and
        #    ChatMessage.session_id has no `ondelete="CASCADE"` at the
        #    database level either. Deleting the sessions first therefore
        #    raised a real IntegrityError (foreign key violation) for any
        #    account with an actual chat message, aborting the whole delete —
        #    a live bug caught via the admin bulk-delete tool stopping partway
        #    through a batch. retention_service.py's expiry sweep already
        #    gets this order right; this mirrors it.
        session_ids = [r[0] for r in db.query(ChatSession.id).filter(ChatSession.user_id == user.id).all()]
        if session_ids:
            db.query(ChatMessage).filter(ChatMessage.session_id.in_(session_ids)).delete(synchronize_session=False)
            db.query(ChatSession).filter(ChatSession.id.in_(session_ids)).delete(synchronize_session=False)

        # 3b. Every other table that references the user. On PostgreSQL the
        #     foreign keys are enforced, so leaving any of these behind would
        #     make the user delete itself fail with an IntegrityError.
        db.query(HumanizerRun).filter(HumanizerRun.user_id == user.id).delete(synchronize_session=False)
        realtime_ids = [r[0] for r in db.query(RealtimeSession.id).filter(RealtimeSession.user_id == user.id).all()]
        if realtime_ids:
            db.query(RealtimeMessage).filter(RealtimeMessage.session_id.in_(realtime_ids)).delete(
                synchronize_session=False
            )
            db.query(RealtimeSession).filter(RealtimeSession.id.in_(realtime_ids)).delete(synchronize_session=False)
        db.query(UsageEvent).filter(UsageEvent.user_id == user.id).delete(synchronize_session=False)

        # 4. Delete user (cascade deletes UserIdentity and RefreshToken)
        db.delete(user)
        db.commit()

        # 5. Block the user's still-valid access tokens from auto-provisioning
        #    the account back into existence (DB-backed, multi-worker safe).
        from app.services.one_time_code_store import deny_account
        deny_account(db, email, ttl_seconds=settings.access_token_expire_minutes * 60)

        logger.info("account_deleted email=%s docs_purged=%d", email, len(docs))
        return {"message": "Account deleted successfully"}

    def logout(self, refresh_token: str | None) -> dict:
        """Revoke the presented refresh token. Idempotent — unknown/absent
        tokens still return success so logout never fails client-side."""
        if refresh_token:
            stored = self.user_repo.get_refresh_token(hash_token(refresh_token))
            if stored and not stored.revoked:
                self.user_repo.revoke_refresh_token(stored)
                self.user_repo.db.commit()
                logger.info("user_logout token_revoked user_id=%s", stored.user_id)
        return {"message": "Logged out"}

    def refresh(self, refresh_token: str) -> dict:
        try:
            payload = decode_refresh_token(refresh_token)
        except ValueError as exc:
            # A malformed/expired JWT must be a 401, not an unhandled 500.
            raise AppError(code="INVALID_REFRESH", message="Invalid refresh token", status_code=401) from exc
        email = payload.get("sub")
        if not email:
            raise AppError(code="INVALID_REFRESH", message="Invalid refresh token", status_code=401)

        user = self.user_repo.get_by_email(email)
        if not user:
            raise AppError(code="INVALID_REFRESH", message="Invalid refresh token", status_code=401)

        stored = self.user_repo.get_refresh_token(hash_token(refresh_token))
        if not stored or stored.revoked:
            raise AppError(code="REFRESH_REVOKED", message="Refresh token is revoked", status_code=401)

        # SQLite strips timezone info on round-trip; treat naive datetimes as UTC.
        stored_expires = stored.expires_at
        if stored_expires.tzinfo is None:
            stored_expires = stored_expires.replace(tzinfo=timezone.utc)
        if stored_expires < datetime.now(timezone.utc):
            raise AppError(code="REFRESH_EXPIRED", message="Refresh token expired", status_code=401)

        access_token = create_access_token(subject=user.email)
        logger.info("token_refreshed email=%s", email)
        return {"token": access_token, "access_token": access_token, "token_type": "bearer"}
