import secrets
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models.otp import OtpToken

OTP_RATE_LIMIT = 5          # max sends per window
OTP_RATE_WINDOW_MINUTES = 60


class OtpRepository:
    def __init__(self, db: Session):
        self.db = db

    def count_recent(self, email: str) -> int:
        """Count OTP sends for this email in the last rate-limit window."""
        since = datetime.utcnow() - timedelta(minutes=OTP_RATE_WINDOW_MINUTES)
        return (
            self.db.query(func.count(OtpToken.id))
            .filter(OtpToken.email == email, OtpToken.expires_at >= since)
            .scalar()
        ) or 0

    def create(self, email: str, purpose: str = "auth", ttl_minutes: int = 10) -> OtpToken:
        code = f"{secrets.randbelow(1_000_000):06d}"
        # Store as UTC-naive so SQLite round-trip comparison stays consistent
        expires_at = datetime.utcnow() + timedelta(minutes=ttl_minutes)
        token = OtpToken(email=email, code=code, purpose=purpose, expires_at=expires_at, used=False)
        self.db.add(token)
        self.db.flush()
        return token

    def get_latest(self, email: str, purpose: str = "auth") -> OtpToken | None:
        return (
            self.db.query(OtpToken)
            .filter(OtpToken.email == email, OtpToken.purpose == purpose, OtpToken.used == False)  # noqa: E712
            .order_by(OtpToken.expires_at.desc())
            .first()
        )

    def mark_used(self, token: OtpToken) -> None:
        token.used = True
        self.db.flush()

    def delete_expired(self, email: str) -> None:
        # Use utcnow() (naive) since SQLite strips tz info on round-trip
        now = datetime.utcnow()
        self.db.query(OtpToken).filter(OtpToken.email == email, OtpToken.expires_at < now).delete()
