"""Admin two-factor authentication (TOTP, RFC 6238).

Email-code sign-in stays the first factor. Once an admin enrols an authenticator app, every admin
endpoint additionally requires a short-lived step-up token obtained by entering a current code.
The secret is stored encrypted (Fernet, key derived from the JWT secret), never in plain text.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from datetime import timedelta
from urllib.parse import quote

from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError

from app.core.config import get_settings
from app.core.security import create_jwt_token, decode_token

STEP_UP_TOKEN_TYPE = "admin_2fa"
STEP_UP_TTL = timedelta(hours=12)
ISSUER = "Querex Admin"
_PERIOD = 30
_DIGITS = 6

# email -> (failure count, window start). In-process, which is enough to make guessing codes impractical.
_FAILURES: dict[str, tuple[int, float]] = {}
MAX_FAILURES = 5
LOCKOUT_SECONDS = 600


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(get_settings().jwt_secret_key.encode()).digest())
    return Fernet(key)


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(stored: str) -> str | None:
    try:
        return _fernet().decrypt(stored.encode()).decode()
    except InvalidToken:
        return None


def provisioning_uri(email: str, secret: str) -> str:
    return f"otpauth://totp/{quote(ISSUER)}:{quote(email)}?secret={secret}&issuer={quote(ISSUER)}&digits={_DIGITS}&period={_PERIOD}"


def _code_at(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % 10**_DIGITS
    return str(value).zfill(_DIGITS)


def verify_code(secret: str, code: str, now: float | None = None) -> bool:
    """Accepts the current code and one step either side (clock drift)."""
    code = (code or "").strip().replace(" ", "")
    if not (code.isdigit() and len(code) == _DIGITS):
        return False
    counter = int((now if now is not None else time.time()) // _PERIOD)
    return any(hmac.compare_digest(_code_at(secret, counter + d), code) for d in (-1, 0, 1))


def is_locked_out(email: str, now: float | None = None) -> bool:
    count, started = _FAILURES.get(email, (0, 0.0))
    return count >= MAX_FAILURES and (now if now is not None else time.time()) - started < LOCKOUT_SECONDS


def record_failure(email: str, now: float | None = None) -> None:
    now = now if now is not None else time.time()
    count, started = _FAILURES.get(email, (0, now))
    if now - started >= LOCKOUT_SECONDS:
        count, started = 0, now
    _FAILURES[email] = (count + 1, started)


def clear_failures(email: str) -> None:
    _FAILURES.pop(email, None)


def issue_step_up_token(email: str) -> str:
    return create_jwt_token(subject=email, token_type=STEP_UP_TOKEN_TYPE, expires_delta=STEP_UP_TTL)


def step_up_token_valid(token: str | None, email: str) -> bool:
    if not token:
        return False
    try:
        payload = decode_token(token)
    except JWTError:
        return False
    return payload.get("type") == STEP_UP_TOKEN_TYPE and payload.get("sub") == email
