import logging
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.security import create_access_token, create_refresh_token, hash_token, hash_password
from app.db.repositories.otp_repository import OtpRepository
from app.db.repositories.user_repository import UserRepository
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)


class OtpService:
    def __init__(
        self,
        otp_repo: OtpRepository,
        user_repo: UserRepository,
        email_service: EmailService,
    ):
        self.otp_repo = otp_repo
        self.user_repo = user_repo
        self.email_service = email_service
        self.settings = get_settings()

    def send_otp(self, email: str) -> dict:
        self.otp_repo.delete_expired(email)
        token = self.otp_repo.create(email=email, purpose="auth")
        self.otp_repo.db.commit()

        dev_code = self.email_service.send_otp_email(email=email, code=token.code)
        logger.info("otp_sent email=%s", email)

        result: dict = {"message": "Verification code sent"}
        if dev_code:
            # Only returned when SMTP is not configured (development mode).
            # Remove SMTP_HOST from .env to disable this in production.
            result["_dev_code"] = dev_code
        return result

    def verify_otp(self, email: str, code: str, password: str | None = None) -> dict:
        token = self.otp_repo.get_latest(email=email, purpose="auth")

        if not token:
            raise AppError(code="OTP_NOT_FOUND", message="No pending verification code", status_code=400)

        # SQLite stores datetimes without tz info; normalise both sides to UTC-naive for comparison
        expires_at = token.expires_at
        if expires_at.tzinfo is not None:
            expires_at = expires_at.replace(tzinfo=None)
        if expires_at < datetime.utcnow():
            raise AppError(code="OTP_EXPIRED", message="Verification code has expired", status_code=400)

        if token.code != code.strip():
            raise AppError(code="OTP_INVALID", message="Invalid verification code", status_code=400)

        self.otp_repo.mark_used(token)

        is_new_user = False
        user = self.user_repo.get_by_email(email)
        if not user:
            is_new_user = True
            hashed = hash_password(password) if password else None
            user = self.user_repo.create(email=email, hashed_password=hashed)
            self.user_repo.create_identity(
                user_id=user.id,
                provider="otp",
                provider_subject=email,
                email=email,
            )

        access_token = create_access_token(subject=user.email)
        refresh_token = create_refresh_token(subject=user.email)
        from datetime import timedelta
        expires_at = datetime.now(timezone.utc) + timedelta(days=self.settings.refresh_token_expire_days)
        self.user_repo.create_refresh_token(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=expires_at,
        )
        self.otp_repo.db.commit()

        logger.info("otp_verified email=%s new_user=%s", email, is_new_user)
        return {
            "token": access_token,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "is_new_user": is_new_user,
        }
