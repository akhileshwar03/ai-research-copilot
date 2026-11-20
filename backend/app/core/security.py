import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from jwt import PyJWTError

from app.core.config import get_settings

# PyJWT, not python-jose: python-jose has an open, unfixed CVE and pulls in `ecdsa` (also
# unfixed) purely to support RS/ES algorithms this app never uses -- it only ever signs with
# HS256 (see settings.jwt_algorithm). PyJWT does the same HS256 encode/decode with no need for
# `ecdsa` at all, and has no open advisories. Same call shapes: encode(payload, key,
# algorithm=...), decode(token, key, algorithms=[...]), and a PyJWTError base exception in
# place of jose's JWTError.

# No password-based auth in this app — sign-in is email OTP or OAuth only,
# so there is deliberately no hash_password/verify_password here.


class TokenKind:
    ACCESS = "access"
    REFRESH = "refresh"


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
    except (PyJWTError, ValueError) as exc:
        raise ValueError("Invalid access token") from exc


def decode_refresh_token(token: str) -> dict:
    try:
        payload = decode_token(token)
        if payload.get("type") != TokenKind.REFRESH:
            raise ValueError("Invalid token type")
        return payload
    except (PyJWTError, ValueError) as exc:
        raise ValueError("Invalid refresh token") from exc


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
