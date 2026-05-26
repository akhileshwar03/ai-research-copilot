import logging
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.db.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo
        self.settings = get_settings()

    def register(self, email: str, password: str) -> dict:
        """Legacy password register — kept for backward compat. Use signup_request for new flows."""
        if self.user_repo.get_by_email(email):
            raise AppError(code="USER_EXISTS", message="An account with this email already exists.", status_code=400)

        user = self.user_repo.create(email=email, hashed_password=hash_password(password))
        self.user_repo.create_identity(
            user_id=user.id, provider="password", provider_subject=email, email=email,
        )
        self.user_repo.db.commit()
        logger.info("user_registered email=%s", email)
        return {"message": "User created"}

    def signup_request(self, email: str, password: str) -> dict:
        """New signup: validates uniqueness, stores pending password, returns OTP gate signal.
        Actual user creation happens in OtpService.verify_otp when email is confirmed."""
        existing = self.user_repo.get_by_email(email)
        if existing and existing.email_verified:
            raise AppError(
                code="USER_EXISTS",
                message="An account with this email already exists. Please sign in instead.",
                status_code=400,
            )
        # Return payload for OTP service to consume
        return {"email": email, "password": password, "needs_otp": True}

    def login_or_create_oauth_user(self, email: str, provider: str, provider_subject: str) -> dict:
        """Find or create a user via OAuth, issue tokens."""
        from datetime import timedelta
        user = self.user_repo.get_by_email(email)
        is_new = False
        if not user:
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

    def login(self, email: str, password: str) -> dict:
        user = self.user_repo.get_by_email(email)
        if not user or not user.hashed_password or not verify_password(password, user.hashed_password):
            raise AppError(code="INVALID_CREDENTIALS", message="Invalid credentials", status_code=401)

        access_token = create_access_token(subject=user.email)
        refresh_token = create_refresh_token(subject=user.email)
        expires_at = datetime.now(timezone.utc) + timedelta(days=self.settings.refresh_token_expire_days)

        self.user_repo.create_refresh_token(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=expires_at,
        )
        self.user_repo.db.commit()
        logger.info("user_login email=%s", email)

        return {
            "token": access_token,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
        }

    def change_password(self, email: str, current_password: str, new_password: str) -> dict:
        user = self.user_repo.get_by_email(email)
        if not user:
            raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)
        if not user.hashed_password or not verify_password(current_password, user.hashed_password):
            raise AppError(
                code="INVALID_CREDENTIALS",
                message="Current password is incorrect",
                status_code=400,
            )
        if len(new_password) < 8:
            raise AppError(
                code="WEAK_PASSWORD",
                message="Password must be at least 8 characters",
                status_code=400,
            )
        self.user_repo.update_password(user, hash_password(new_password))
        self.user_repo.db.commit()
        logger.info("password_changed email=%s", email)
        return {"message": "Password changed successfully"}

    def delete_account(self, email: str) -> dict:
        """Permanently delete a user account and all associated data."""
        from app.db.models.chat_models import ChatSession
        from app.db.models.document import Document

        user = self.user_repo.get_by_email(email)
        if not user:
            raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)

        db = self.user_repo.db

        # Delete chat sessions (cascade deletes ChatMessages via relationship)
        db.query(ChatSession).filter(ChatSession.user_id == user.id).delete(synchronize_session=False)

        # Delete documents (user_email is a plain string column, no FK cascade)
        db.query(Document).filter(Document.user_email == email).delete(synchronize_session=False)

        # Delete the user (cascade deletes UserIdentity and RefreshToken via ORM)
        db.delete(user)
        db.commit()

        logger.info("account_deleted email=%s", email)
        return {"message": "Account deleted successfully"}

    def refresh(self, refresh_token: str) -> dict:
        payload = decode_refresh_token(refresh_token)
        email = payload.get("sub")
        if not email:
            raise AppError(code="INVALID_REFRESH", message="Invalid refresh token", status_code=401)

        user = self.user_repo.get_by_email(email)
        if not user:
            raise AppError(code="INVALID_REFRESH", message="Invalid refresh token", status_code=401)

        stored = self.user_repo.get_refresh_token(hash_token(refresh_token))
        if not stored or stored.revoked:
            raise AppError(code="REFRESH_REVOKED", message="Refresh token is revoked", status_code=401)

        if stored.expires_at < datetime.now(timezone.utc):
            raise AppError(code="REFRESH_EXPIRED", message="Refresh token expired", status_code=401)

        access_token = create_access_token(subject=user.email)
        logger.info("token_refreshed email=%s", email)
        return {"token": access_token, "access_token": access_token, "token_type": "bearer"}
