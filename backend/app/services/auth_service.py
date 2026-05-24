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
        if self.user_repo.get_by_email(email):
            raise AppError(code="USER_EXISTS", message="User already exists", status_code=400)

        user = self.user_repo.create(email=email, hashed_password=hash_password(password))
        self.user_repo.create_identity(
            user_id=user.id,
            provider="password",
            provider_subject=email,
            email=email,
        )
        self.user_repo.db.commit()
        logger.info("user_registered email=%s", email)
        return {"message": "User created"}

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
