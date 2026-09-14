import hmac
import logging
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.security import create_access_token, create_refresh_token, hash_token
from app.db.repositories.otp_repository import OtpRepository, _utcnow_naive
from app.db.repositories.user_repository import UserRepository
from app.services.email_service import EmailService
from app.services.runtime_settings import runtime_settings

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


def _assert_signup_allowed(user_repo: UserRepository, email: str) -> None:
    """Admins can close sign-ups at runtime; existing accounts are unaffected."""
    if bool(runtime_settings.get("signups_enabled")):
        return
    if user_repo.get_by_email(email):
        return
    raise AppError(
        code="SIGNUPS_DISABLED",
        message="New sign-ups are currently closed. If you already have an account, use the same email.",
        status_code=403,
    )


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
        """Send a 6-digit OTP to *email*. Works for both sign-in (existing
        account) and sign-up (new account) — this app has a single, unified
        email auth flow with no separate register/login step."""
        from app.db.repositories.otp_repository import OTP_RATE_LIMIT

        _assert_signup_allowed(self.user_repo, email)
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

    def verify_otp(self, email: str, code: str) -> dict:
        token = self.otp_repo.get_latest(email=email, purpose="auth")
        if not token:
            raise AppError(code="OTP_NOT_FOUND", message="No pending verification code", status_code=400)

        if _is_expired(token.expires_at):
            raise AppError(code="OTP_EXPIRED", message="Verification code has expired", status_code=400)

        self._check_code(token, code)
        self.otp_repo.mark_used(token)

        is_new_user = False
        user = self.user_repo.get_by_email(email)
        if not user:
            _assert_signup_allowed(self.user_repo, email)
            is_new_user = True
            user = self.user_repo.create(email=email, hashed_password=None, email_verified=True)
            self.user_repo.create_identity(
                user_id=user.id,
                provider="otp",
                provider_subject=email,
                email=email,
            )
        else:
            user.email_verified = True

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
