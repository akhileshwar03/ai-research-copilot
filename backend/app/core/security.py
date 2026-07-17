import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings


class TokenKind:
    ACCESS = "access"
    REFRESH = "refresh"


def validate_password_strength(password: str) -> None:
    """Raise ValueError if *password* fails minimum strength requirements."""
    errors = []
    if len(password) < 8:
        errors.append("at least 8 characters")
    if not any(c.isupper() for c in password):
        errors.append("at least one uppercase letter")
    if not any(c.islower() for c in password):
        errors.append("at least one lowercase letter")
    if not any(c.isdigit() for c in password):
        errors.append("at least one digit")
    if errors:
        raise ValueError("Password must contain " + ", ".join(errors) + ".")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt directly (bypasses passlib's Python 3.14 incompatibility)."""
    pw_bytes = password.encode("utf-8")[:72]
    return _bcrypt.hashpw(pw_bytes, _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its bcrypt hash."""
    pw_bytes = plain_password.encode("utf-8")[:72]
    return _bcrypt.checkpw(pw_bytes, hashed_password.encode("utf-8"))


def create_jwt_token(subject: str, token_type: str, expires_delta: timedelta) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str) -> str:
    settings = get_settings()
    return create_jwt_token(
        subject=subject,
        token_type=TokenKind.ACCESS,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )


def create_refresh_token(subject: str) -> str:
    settings = get_settings()
    return create_jwt_token(
        subject=subject,
        token_type=TokenKind.REFRESH,
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
    )


def decode_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def decode_access_token(token: str) -> dict:
    try:
        payload = decode_token(token)
        if payload.get("type") != TokenKind.ACCESS:
            raise ValueError("Invalid token type")
        return payload
    except (JWTError, ValueError) as exc:
        raise ValueError("Invalid access token") from exc


def decode_refresh_token(token: str) -> dict:
    try:
        payload = decode_token(token)
        if payload.get("type") != TokenKind.REFRESH:
            raise ValueError("Invalid token type")
        return payload
    except (JWTError, ValueError) as exc:
        raise ValueError("Invalid refresh token") from exc


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
