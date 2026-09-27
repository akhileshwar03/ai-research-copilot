"""Daily allowance for expensive chat requests.

A whole-document request (a research action, or a "how many / list all" question) puts up to
``rag_full_document_max_chars`` of text in front of the model -- roughly 15x the cost of a normal grounded
question -- so each user gets ``chat_full_document_daily_limit`` of them per UTC day.

The check and the increment are ONE atomic statement (an upsert whose UPDATE is conditional on the count being
under the limit), so two simultaneous requests can never both take the last slot.
"""

import logging
from datetime import date, datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.db.models.chat_quota import ChatQuotaUsage

logger = logging.getLogger(__name__)

FULL_DOCUMENT = "full_document"


def _session():
    # Deferred import so tests can monkeypatch app.db.session.SessionLocal (same pattern as PgVectorStore).
    from app.db.session import SessionLocal

    return SessionLocal()


def _today() -> date:
    return datetime.now(timezone.utc).date()


def try_consume(db: Session, user_id: int, kind: str, limit: int, today: date | None = None) -> tuple[bool, int]:
    """Take one use of *kind* for *user_id* using the caller's session (the request's own, so it is the same
    database the rest of the request sees). Returns ``(allowed, used_today)``.

    ``limit <= 0`` means unlimited: nothing is recorded and the request is always allowed.
    """
    if limit <= 0:
        return True, 0
    day = today or _today()
    try:
        insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
        stmt = (
            insert(ChatQuotaUsage)
            .values(user_id=user_id, day=day, kind=kind, count=1)
            .on_conflict_do_update(
                index_elements=[ChatQuotaUsage.user_id, ChatQuotaUsage.day, ChatQuotaUsage.kind],
                set_={"count": ChatQuotaUsage.count + 1},
                where=ChatQuotaUsage.count < limit,
            )
            .returning(ChatQuotaUsage.count)
        )
        row = db.execute(stmt).first()
        if row is not None:
            db.commit()
            return True, int(row[0])
        db.rollback()
        used = db.execute(
            select(ChatQuotaUsage.count).where(
                ChatQuotaUsage.user_id == user_id, ChatQuotaUsage.day == day, ChatQuotaUsage.kind == kind
            )
        ).scalar()
        return False, int(used or limit)
    except Exception:
        db.rollback()
        raise


def refund(user_id: int, kind: str, today: date | None = None) -> None:
    """Give back a use that produced no answer (the request failed before any text was returned), so an
    outage on our side never costs a user part of their allowance. Best-effort: never raises."""
    day = today or _today()
    db = _session()
    try:
        db.execute(
            update(ChatQuotaUsage)
            .where(
                ChatQuotaUsage.user_id == user_id,
                ChatQuotaUsage.day == day,
                ChatQuotaUsage.kind == kind,
                ChatQuotaUsage.count > 0,
            )
            .values(count=ChatQuotaUsage.count - 1)
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("chat_quota_refund_failed user_id=%s kind=%s", user_id, kind, exc_info=True)
    finally:
        db.close()
