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

    def send_otp(self, email: str, require_existing_account: bool = False) -> dict:
        """Send an OTP to *email*.

        Args:
            require_existing_account: When True (forgot-password flow) the call
                raises a generic error if no account exists so we don't leak
                whether the email is registered.  When False (sign-up / sign-in)
                any email is accepted.
        """
        from app.db.repositories.otp_repository import OTP_RATE_LIMIT
        if require_existing_account and not self.user_repo.get_by_email(email):
            # Return a generic success-looking message — don't reveal account existence
            logger.info("otp_skipped_no_account email=%s", email)
            return {"message": "If an account exists for this email, a code has been sent."}

        recent = self.otp_repo.count_recent(email)
        if recent >= OTP_RATE_LIMIT:
            raise AppError(
                code="OTP_RATE_LIMITED",
                message="Too many codes sent. Please wait before requesting another.",
                status_code=429,
            )
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
            user = self.user_repo.create(email=email, hashed_password=hashed, email_verified=True)
            self.user_repo.create_identity(
                user_id=user.id,
                provider="otp",
                provider_subject=email,
                email=email,
            )
        else:
            # Mark email as verified and optionally set password
            user.email_verified = True
            if password and not user.hashed_password:
                user.hashed_password = hash_password(password)

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

    def reset_password(self, email: str, code: str, new_password: str) -> dict:
        """Forgot-password flow: verify OTP and set a new password (no current password required)."""
        from app.core.security import hash_password

        if len(new_password) < 8:
            raise AppError(
                code="WEAK_PASSWORD",
                message="Password must be at least 8 characters",
                status_code=400,
            )

        token = self.otp_repo.get_latest(email=email, purpose="auth")
        if not token:
            raise AppError(code="OTP_NOT_FOUND", message="No pending verification code", status_code=400)

        expires_at = token.expires_at
        if expires_at.tzinfo is not None:
            expires_at = expires_at.replace(tzinfo=None)
        if expires_at < datetime.utcnow():
            raise AppError(code="OTP_EXPIRED", message="Verification code has expired", status_code=400)

        if token.code != code.strip():
            raise AppError(code="OTP_INVALID", message="Invalid verification code", status_code=400)

        user = self.user_repo.get_by_email(email)
        if not user:
            raise AppError(code="USER_NOT_FOUND", message="No account found for this email", status_code=404)

        self.otp_repo.mark_used(token)
        self.user_repo.update_password(user, hash_password(new_password))
        self.otp_repo.db.commit()

        logger.info("password_reset email=%s", email)
        return {"message": "Password reset successfully"}
