"""DB-backed single-use code store.

Multi-worker safe: codes live in the one_time_codes table, so any worker or
instance can consume a code created by another. Single-use is enforced by the
DELETE rowcount — whichever transaction deletes the row first wins; everyone
else sees an invalid code.

Codes are stored as SHA-256 hashes so a database leak does not expose live
codes. Exchange payloads (JWT pairs) are stored plaintext but live for only
120 seconds and are deleted on first use.
"""

import hashlib
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db.models.one_time_code import OneTimeCode

logger = logging.getLogger(__name__)

PURPOSE_OAUTH_EXCHANGE = "oauth_exchange"
PURPOSE_OAUTH_STATE = "oauth_state"
PURPOSE_DELETED_ACCOUNT = "deleted_account"

OAUTH_EXCHANGE_TTL_SECONDS = 120
OAUTH_STATE_TTL_SECONDS = 600  # provider consent screens can take a while


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    # Stored naive-UTC for SQLite compatibility; PostgreSQL treats it as UTC.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _evict_expired(db: Session) -> None:
    db.query(OneTimeCode).filter(OneTimeCode.expires_at < _utcnow()).delete(
        synchronize_session=False
    )


def create_code(db: Session, purpose: str, payload: dict | None, ttl_seconds: int) -> str:
    """Create a single-use code and return its raw (unhashed) value."""
    _evict_expired(db)
    code = secrets.token_urlsafe(32)
    db.add(
        OneTimeCode(
            code_hash=_hash(code),
            purpose=purpose,
            payload=json.dumps(payload) if payload is not None else None,
            expires_at=_utcnow() + timedelta(seconds=ttl_seconds),
        )
    )
    db.commit()
    return code


def consume_code(db: Session, purpose: str, code: str) -> dict | None:
    """Atomically consume a code. Returns its payload ({} if none was stored),
    or None when the code is unknown, expired, or already consumed."""
    if not code:
        return None

    code_hash = _hash(code)
    row = (
        db.query(OneTimeCode)
        .filter(
            OneTimeCode.code_hash == code_hash,
            OneTimeCode.purpose == purpose,
            OneTimeCode.expires_at >= _utcnow(),
        )
        .first()
    )
    if row is None:
        return None

    payload = json.loads(row.payload) if row.payload else {}

    # The DELETE rowcount is the single-use arbiter under concurrency.
    deleted = (
        db.query(OneTimeCode)
        .filter(OneTimeCode.id == row.id)
        .delete(synchronize_session=False)
    )
    db.commit()
    if deleted == 0:
        return None  # another worker consumed it first
    return payload


def deny_account(db: Session, email: str, ttl_seconds: int) -> None:
    """Add *email* to the deleted-account denylist for *ttl_seconds*.

    Deterministic hash of the email is used as the code so re-adding upserts.
    """
    code_hash = _hash(f"{PURPOSE_DELETED_ACCOUNT}:{email.lower()}")
    db.query(OneTimeCode).filter(OneTimeCode.code_hash == code_hash).delete(
        synchronize_session=False
    )
    db.add(
        OneTimeCode(
            code_hash=code_hash,
            purpose=PURPOSE_DELETED_ACCOUNT,
            payload=None,
            expires_at=_utcnow() + timedelta(seconds=ttl_seconds),
        )
    )
    db.commit()


def is_account_denied(db: Session, email: str) -> bool:
    code_hash = _hash(f"{PURPOSE_DELETED_ACCOUNT}:{email.lower()}")
    return (
        db.query(OneTimeCode.id)
        .filter(
            OneTimeCode.code_hash == code_hash,
            OneTimeCode.expires_at >= _utcnow(),
        )
        .first()
        is not None
    )
