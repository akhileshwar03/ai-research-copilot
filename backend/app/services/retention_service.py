"""Free-tier retention: automatic cleanup of expired data.

Documents and chat sessions older than the admin-configurable
``retention_days`` window are purged — PDF file, vector embeddings, and
database rows together, so the three stores never drift out of sync.

Scheduling model
----------------
There is no external scheduler dependency. Any inbound request (in practice
the uptime ping that keeps the free-tier instance awake) may *offer* to run
the cleanup; an atomic claim on an ``app_settings`` row guarantees that at
most one worker actually does, at most once per CLEANUP_INTERVAL. A cheap
in-process throttle keeps the hot path free of database reads.

The cleanup also evicts operational debris regardless of retention policy:
expired one-time codes and expired/used OTP rows.
"""

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)

CLEANUP_INTERVAL_HOURS = 24
_LAST_RUN_KEY = "retention_last_run_at"

# In-process throttle: consult the database claim at most this often.
_LOCAL_CHECK_INTERVAL_SECONDS = 600
_local_lock = threading.Lock()
_last_local_check = 0.0


def _utcnow_naive() -> datetime:
    """Naive UTC — matches how timestamps are stored on SQLite and compares
    correctly against timestamptz on PostgreSQL (session TZ is UTC)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _try_claim(db: Session) -> bool:
    """Atomically claim the right to run this cleanup cycle.

    The UPDATE's rowcount (compare-and-swap on the previous value) is the
    arbiter under concurrency: exactly one worker wins per interval.
    """
    from app.db.models.app_setting import AppSetting

    now = _utcnow_naive()
    row = db.get(AppSetting, _LAST_RUN_KEY)

    if row is None:
        try:
            db.add(AppSetting(key=_LAST_RUN_KEY, value=now.isoformat()))
            db.commit()
            return True
        except IntegrityError:
            db.rollback()
            return False  # another worker inserted first

    try:
        last_run = datetime.fromisoformat(row.value)
    except ValueError:
        last_run = datetime.min

    if now - last_run < timedelta(hours=CLEANUP_INTERVAL_HOURS):
        return False

    claimed = (
        db.query(AppSetting)
        .filter(AppSetting.key == _LAST_RUN_KEY, AppSetting.value == row.value)
        .update({"value": now.isoformat()}, synchronize_session=False)
    )
    db.commit()
    return claimed == 1


def run_cleanup() -> dict:
    """Purge expired documents, chats, and operational debris.

    Opens its own session — designed to run as a background task, fully
    decoupled from any request-scoped session. Returns a summary for logging
    and tests.
    """
    import os

    from app.db.models.chat_models import ChatMessage, ChatSession
    from app.db.models.document import Document
    from app.db.models.otp import OtpToken
    from app.db.models.one_time_code import OneTimeCode
    from app.db.session import SessionLocal
    from app.modules.rag.vector_store_manager import VectorStoreManager

    settings = get_settings()
    retention_days = int(runtime_settings.get("retention_days"))
    now = _utcnow_naive()
    summary = {"documents": 0, "sessions": 0, "otp_tokens": 0, "one_time_codes": 0}

    db = SessionLocal()
    try:
        # ── Operational debris: always evicted, independent of policy ─────────
        summary["one_time_codes"] = (
            db.query(OneTimeCode).filter(OneTimeCode.expires_at < now).delete(synchronize_session=False)
        )
        summary["otp_tokens"] = (
            db.query(OtpToken)
            .filter((OtpToken.expires_at < now) | (OtpToken.used.is_(True)))
            .delete(synchronize_session=False)
        )
        db.commit()

        # ── Retention policy: 0 means keep forever ────────────────────────────
        if retention_days <= 0:
            logger.info("retention_cleanup_done policy=disabled summary=%s", summary)
            return summary

        cutoff = now - timedelta(days=retention_days)

        # Documents: file, vectors, and row must go together.
        expired_docs = db.query(Document).filter(Document.created_at < cutoff).all()
        if expired_docs:
            vector_store = VectorStoreManager()
            for doc in expired_docs:
                filepath = os.path.join(settings.uploads_dir, doc.stored_filename)
                if os.path.exists(filepath):
                    try:
                        os.remove(filepath)
                    except OSError:
                        logger.exception("retention_file_removal_failed path=%s", filepath)
                try:
                    vector_store.delete_by_source(doc.stored_filename)
                except Exception:
                    logger.exception("retention_vector_removal_failed source=%s", doc.stored_filename)
                db.delete(doc)
            summary["documents"] = len(expired_docs)
            db.commit()

        # Chats: delete messages first (no DB-level cascade on bulk deletes).
        expired_session_ids = [
            row[0]
            for row in db.query(ChatSession.id).filter(ChatSession.created_at < cutoff).all()
        ]
        if expired_session_ids:
            db.query(ChatMessage).filter(ChatMessage.session_id.in_(expired_session_ids)).delete(
                synchronize_session=False
            )
            db.query(ChatSession).filter(ChatSession.id.in_(expired_session_ids)).delete(
                synchronize_session=False
            )
            summary["sessions"] = len(expired_session_ids)
            db.commit()

        logger.info(
            "retention_cleanup_done retention_days=%d cutoff=%s summary=%s",
            retention_days,
            cutoff.isoformat(),
            summary,
        )
        return summary
    except Exception:
        db.rollback()
        logger.exception("retention_cleanup_failed")
        return summary
    finally:
        db.close()


def maybe_run_cleanup() -> None:
    """Cheap, safe entry point for the request path (uptime ping).

    Fast exit via an in-process throttle; the database claim decides whether
    this worker actually runs the cycle. Never raises.
    """
    global _last_local_check

    with _local_lock:
        if time.monotonic() - _last_local_check < _LOCAL_CHECK_INTERVAL_SECONDS:
            return
        _last_local_check = time.monotonic()

    try:
        from app.db.session import SessionLocal

        db = SessionLocal()
        try:
            claimed = _try_claim(db)
        finally:
            db.close()

        if claimed:
            run_cleanup()
    except Exception:
        # A failed cleanup check must never affect the request that hosted it.
        logger.exception("retention_claim_failed")
