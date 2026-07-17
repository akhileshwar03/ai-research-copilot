import hmac
import logging
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_token,
    validate_password_strength,
)
from app.db.repositories.otp_repository import OtpRepository, _utcnow_naive
from app.db.repositories.user_repository import UserRepository
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)

# A 6-digit code has 10^6 combinations; without a per-token attempt cap an
# attacker with many IPs can brute-force it within the 10-minute TTL.
MAX_OTP_ATTEMPTS = 5


def _is_expired(expires_at: datetime) -> bool:
    """Compare a potentially tz-naive OTP expiry against the current UTC time.

    The OTP repository stores naive UTC datetimes (SQLite strips timezone info
    on round-trip). Stripping tzinfo from the stored value before comparing
    keeps this correct on both SQLite and PostgreSQL.
    """
    naive_expiry = expires_at.replace(tzinfo=None) if expires_at.tzinfo else expires_at
    return naive_expiry < _utcnow_naive()


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
        """Send a 6-digit OTP to *email*.

        When *require_existing_account* is True (forgot-password flow), the
        response is identical whether or not the account exists — prevents
        enumeration of registered email addresses.
        """
        from app.db.repositories.otp_repository import OTP_RATE_LIMIT

        if require_existing_account and not self.user_repo.get_by_email(email):
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
            result["_dev_code"] = dev_code
        return result

    def _check_code(self, token, code: str) -> None:
        """Validate *code* against *token* with attempt limiting.

        Uses a constant-time comparison (no timing side-channel) and burns the
        token after MAX_OTP_ATTEMPTS failures so the code cannot be brute-forced
        within its TTL.
        """
        if token.attempts is not None and token.attempts >= MAX_OTP_ATTEMPTS:
            raise AppError(
                code="OTP_TOO_MANY_ATTEMPTS",
                message="Too many incorrect attempts. Please request a new code.",
                status_code=429,
            )

        if not hmac.compare_digest(token.code, code.strip()):
            token.attempts = (token.attempts or 0) + 1
            if token.attempts >= MAX_OTP_ATTEMPTS:
                token.used = True  # burn the token permanently
            self.otp_repo.db.commit()
            raise AppError(code="OTP_INVALID", message="Invalid verification code", status_code=400)

    def verify_otp(self, email: str, code: str, password: str | None = None) -> dict:
        token = self.otp_repo.get_latest(email=email, purpose="auth")
        if not token:
            raise AppError(code="OTP_NOT_FOUND", message="No pending verification code", status_code=400)

        if _is_expired(token.expires_at):
            raise AppError(code="OTP_EXPIRED", message="Verification code has expired", status_code=400)

        self._check_code(token, code)

        # Enforce the password policy here too: signup_request validates it, but
        # this endpoint is directly reachable and must not mint weak accounts.
        if password and not self.user_repo.get_by_email(email):
            try:
                validate_password_strength(password)
            except ValueError as exc:
                raise AppError(code="WEAK_PASSWORD", message=str(exc), status_code=400) from exc

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
            user.email_verified = True
            if password and not user.hashed_password:
                user.hashed_password = hash_password(password)

        access_token = create_access_token(subject=user.email)
        refresh_token = create_refresh_token(subject=user.email)
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
        """Forgot-password flow: verify OTP then set a new password."""
        try:
            validate_password_strength(new_password)
        except ValueError as exc:
            raise AppError(code="WEAK_PASSWORD", message=str(exc), status_code=400) from exc

        token = self.otp_repo.get_latest(email=email, purpose="auth")
        if not token:
            raise AppError(code="OTP_NOT_FOUND", message="No pending verification code", status_code=400)

        if _is_expired(token.expires_at):
            raise AppError(code="OTP_EXPIRED", message="Verification code has expired", status_code=400)

        self._check_code(token, code)

        user = self.user_repo.get_by_email(email)
        if not user:
            raise AppError(code="USER_NOT_FOUND", message="No account found for this email", status_code=404)

        self.otp_repo.mark_used(token)
        self.user_repo.update_password(user, hash_password(new_password))
        self.otp_repo.db.commit()

        logger.info("password_reset email=%s", email)
        return {"message": "Password reset successfully"}
