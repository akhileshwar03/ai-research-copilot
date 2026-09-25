"""Admin-only endpoints: overview stats, analytics, user and document
management, runtime settings, audit log, and system health.

All routes require a valid access token belonging to a user with
is_admin=True (enforced by the require_admin dependency). Admins are
bootstrapped via the ADMIN_EMAILS env var and can promote other users from
here. Every state-changing action is written to admin_audit_log.
"""

import csv
import io
import logging
import os
import platform
import sys
import time
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile
from PIL import Image
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import case, func, text
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin
from app.api.dependencies.services import (
    get_ai_service,
    get_auth_service,
    get_document_service,
    get_vector_store_manager,
)
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.db.models.admin_audit_log import AdminAuditLog
from app.db.models.app_setting import AppSetting
from app.db.models.chat_models import ChatMessage, ChatSession
from app.db.models.document import Document
from app.db.models.humanizer_run import HumanizerRun
from app.db.models.realtime_models import RealtimeMessage, RealtimeSession
from app.db.models.usage_event import UsageEvent
from app.db.models.user import RefreshToken, User
from app.db.session import engine, get_db
from app.services.admin_audit import record_admin_action
from app.services.ai_service import AIService
from app.services.auth_service import AuthService
from app.services.document_service import DocumentService
from app.services.retention_service import run_cleanup
from app.services.runtime_settings import BACKGROUND_PAGES, CATEGORY_LABELS, describe_settings, runtime_settings
from app.services.storage_service import get_storage_service
from app.services.usage_tracking import TOOL_LABELS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])

_STARTED_AT = time.time()


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── Schemas ────────────────────────────────────────────────────────────────────

class AdminStats(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    suspended_users: int
    new_users_7d: int
    total_documents: int
    failed_documents: int
    total_storage_bytes: int
    total_sessions: int
    total_messages: int
    total_humanizer_runs: int
    total_realtime_sessions: int
    requests_24h: int
    errors_24h: int
    active_users_24h: int


class AdminUser(BaseModel):
    id: int
    email: str
    is_active: bool
    is_admin: bool
    email_verified: bool
    created_at: datetime | None
    document_count: int
    session_count: int
    last_active_at: datetime | None = None


class AdminUserList(BaseModel):
    users: list[AdminUser]
    total: int
    skip: int
    limit: int


class UserPatch(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None
    email_verified: bool | None = None


class SettingDescriptor(BaseModel):
    key: str
    value: bool | int | float | str
    default: bool | int | float | str
    min: float
    max: float
    type: str
    category: str
    category_label: str
    description: str
    choices: list[str] | None = None


class SettingsUpdate(BaseModel):
    settings: dict[str, bool | int | float | str]


class MessageResponse(BaseModel):
    message: str


class AdminDocument(BaseModel):
    id: str
    name: str
    owner_email: str | None
    size_bytes: int
    upload_status: str
    error_message: str | None
    page_count: int | None
    pinned: bool
    created_at: datetime | None


class AdminDocumentList(BaseModel):
    documents: list[AdminDocument]
    total: int
    skip: int
    limit: int


class AuditEntry(BaseModel):
    id: int
    admin_email: str
    action: str
    target: str | None
    details: str | None
    created_at: datetime | None


class AuditLogResponse(BaseModel):
    entries: list[AuditEntry]
    total: int
    skip: int
    limit: int


class UsageEventOut(BaseModel):
    id: int
    tool: str
    user_email: str | None
    status_code: int
    ok: bool
    duration_ms: int
    request_id: str | None
    created_at: datetime | None


class UsageEventList(BaseModel):
    events: list[UsageEventOut]
    total: int
    skip: int
    limit: int


# ── Overview ───────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=AdminStats)
def get_stats(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    now = _utcnow_naive()
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)

    def count(q) -> int:
        return int(q.scalar() or 0)

    storage = db.query(func.coalesce(func.sum(Document.size_bytes), 0)).scalar() or 0
    return AdminStats(
        total_users=count(db.query(func.count(User.id))),
        active_users=count(db.query(func.count(User.id)).filter(User.is_active.is_(True))),
        admin_users=count(db.query(func.count(User.id)).filter(User.is_admin.is_(True))),
        suspended_users=count(db.query(func.count(User.id)).filter(User.is_active.is_(False))),
        new_users_7d=count(db.query(func.count(User.id)).filter(User.created_at >= week_ago)),
        total_documents=count(db.query(func.count(Document.id))),
        failed_documents=count(
            db.query(func.count(Document.id)).filter(Document.upload_status.in_(["failed", "empty"]))
        ),
        total_storage_bytes=int(storage),
        total_sessions=count(db.query(func.count(ChatSession.id))),
        total_messages=count(db.query(func.count(ChatMessage.id))),
        total_humanizer_runs=count(db.query(func.count(HumanizerRun.id))),
        total_realtime_sessions=count(db.query(func.count(RealtimeSession.id))),
        requests_24h=count(db.query(func.count(UsageEvent.id)).filter(UsageEvent.created_at >= day_ago)),
        errors_24h=count(
            db.query(func.count(UsageEvent.id)).filter(UsageEvent.created_at >= day_ago, UsageEvent.ok.is_(False))
        ),
        active_users_24h=count(
            db.query(func.count(func.distinct(UsageEvent.user_id))).filter(
                UsageEvent.created_at >= day_ago, UsageEvent.user_id.isnot(None)
            )
        ),
    )


# ── Analytics ──────────────────────────────────────────────────────────────────

def _daily_counts(db: Session, column, since: datetime, *filters, until: datetime | None = None) -> dict[str, int]:
    """{YYYY-MM-DD: count} for rows whose *column* timestamp is >= since (and < until, if given)."""
    bounds = [column >= since] + ([column < until] if until is not None else [])
    rows = (
        db.query(func.date(column), func.count())
        .filter(*bounds, *filters)
        .group_by(func.date(column))
        .all()
    )
    out: dict[str, int] = {}
    for day, n in rows:
        key = day.isoformat() if isinstance(day, (date, datetime)) else str(day)[:10]
        out[key] = int(n)
    return out


def _percentile(values: list[int], pct: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(pct * (len(ordered) - 1))))
    return int(ordered[index])


def _compute_analytics(db: Session, start: date, end: date, user_id: int | None, user_email: str | None) -> dict:
    """Daily series and per-tool aggregates for the inclusive UTC day range
    [start, end], optionally scoped to a single user."""
    now = _utcnow_naive()
    days = (end - start).days + 1
    since = datetime(start.year, start.month, start.day)
    until = since + timedelta(days=days)

    def scoped(column, *extra):
        return [*extra, column == user_id] if user_id is not None else list(extra)

    signups = _daily_counts(db, User.created_at, since, *scoped(User.id), until=until)
    documents = _daily_counts(
        db, Document.created_at, since, *([Document.user_email == user_email] if user_id is not None else []), until=until
    )
    sessions = _daily_counts(db, ChatSession.created_at, since, *scoped(ChatSession.user_id), until=until)
    humanizer_runs = _daily_counts(db, HumanizerRun.created_at, since, *scoped(HumanizerRun.user_id), until=until)
    realtime_sessions = _daily_counts(
        db, RealtimeSession.created_at, since, *scoped(RealtimeSession.user_id), until=until
    )
    requests = _daily_counts(db, UsageEvent.created_at, since, *scoped(UsageEvent.user_id), until=until)
    errors = _daily_counts(
        db, UsageEvent.created_at, since, *scoped(UsageEvent.user_id, UsageEvent.ok.is_(False)), until=until
    )

    # Chat messages have no timestamp of their own — attribute them to their
    # session's creation day, which is exact for the (dominant) single-day
    # conversations and a close approximation otherwise.
    message_rows = (
        db.query(func.date(ChatSession.created_at), func.count(ChatMessage.id))
        .join(ChatMessage, ChatMessage.session_id == ChatSession.id)
        .filter(ChatSession.created_at >= since, ChatSession.created_at < until, *scoped(ChatSession.user_id))
        .group_by(func.date(ChatSession.created_at))
        .all()
    )
    messages = {
        (d.isoformat() if isinstance(d, (date, datetime)) else str(d)[:10]): int(n) for d, n in message_rows
    }

    series = []
    for offset in range(days):
        day = (since + timedelta(days=offset)).date().isoformat()
        series.append(
            {
                "date": day,
                "signups": signups.get(day, 0),
                "documents": documents.get(day, 0),
                "sessions": sessions.get(day, 0),
                "messages": messages.get(day, 0),
                "humanizer_runs": humanizer_runs.get(day, 0),
                "realtime_sessions": realtime_sessions.get(day, 0),
                "requests": requests.get(day, 0),
                "errors": errors.get(day, 0),
            }
        )

    # Per-tool aggregates. Durations are pulled for percentile math — capped
    # so a very busy window can't turn this into a multi-megabyte fetch.
    events = (
        db.query(UsageEvent.tool, UsageEvent.ok, UsageEvent.duration_ms, UsageEvent.user_id)
        .filter(UsageEvent.created_at >= since, UsageEvent.created_at < until, *scoped(UsageEvent.user_id))
        .order_by(UsageEvent.created_at.desc())
        .limit(20000)
        .all()
    )
    by_tool: dict[str, dict] = defaultdict(lambda: {"requests": 0, "errors": 0, "durations": [], "users": set()})
    per_user: dict[int, int] = defaultdict(int)
    for tool, ok, duration_ms, event_user_id in events:
        bucket = by_tool[tool]
        bucket["requests"] += 1
        if not ok:
            bucket["errors"] += 1
        bucket["durations"].append(int(duration_ms or 0))
        if event_user_id is not None:
            bucket["users"].add(event_user_id)
            per_user[event_user_id] += 1

    tools = []
    for tool in sorted(by_tool, key=lambda t: -by_tool[t]["requests"]):
        b = by_tool[tool]
        durations = b["durations"]
        tools.append(
            {
                "tool": tool,
                "label": TOOL_LABELS.get(tool, tool),
                "requests": b["requests"],
                "errors": b["errors"],
                "error_rate": round(b["errors"] / b["requests"], 4) if b["requests"] else 0.0,
                "avg_ms": int(sum(durations) / len(durations)) if durations else 0,
                "p95_ms": _percentile(durations, 0.95),
                "users": len(b["users"]),
            }
        )

    top_ids = sorted(per_user, key=lambda u: -per_user[u])[:10]
    emails = dict(db.query(User.id, User.email).filter(User.id.in_(top_ids)).all()) if top_ids else {}
    top_users = [
        {"user_id": uid, "email": emails.get(uid, "(deleted)"), "requests": per_user[uid]} for uid in top_ids
    ]

    def active_since(delta: timedelta) -> int:
        return int(
            db.query(func.count(func.distinct(UsageEvent.user_id)))
            .filter(UsageEvent.created_at >= now - delta, *scoped(UsageEvent.user_id, UsageEvent.user_id.isnot(None)))
            .scalar()
            or 0
        )

    doc_status_query = db.query(Document.upload_status, func.count(Document.id))
    if user_id is not None:
        doc_status_query = doc_status_query.filter(Document.user_email == user_email)

    return {
        "days": days,
        "since": start.isoformat(),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "user_id": user_id,
        "series": series,
        "tools": tools,
        "top_users": top_users,
        "active_users_7d": active_since(timedelta(days=7)),
        "active_users_30d": active_since(timedelta(days=30)),
        "documents_by_status": {
            status: int(n) for status, n in doc_status_query.group_by(Document.upload_status).all()
        },
    }


@router.get("/analytics")
def get_analytics(
    days: int = Query(default=30, ge=1, le=365),
    start: date | None = Query(default=None, description="Inclusive UTC start day, YYYY-MM-DD"),
    end: date | None = Query(default=None, description="Inclusive UTC end day, YYYY-MM-DD"),
    user_id: int | None = Query(default=None, ge=1, description="Scope every series and table to one user"),
    compare: bool = Query(default=False, description="Also return the equivalent immediately-preceding period"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Daily time series and per-tool aggregates.

    The window is [start, end] when either is given (a missing end defaults to
    today, a missing start to end - days + 1), otherwise the last *days* days.
    """
    today = _utcnow_naive().date()
    range_end = end or today
    range_start = start or (range_end - timedelta(days=days - 1))
    if range_start > range_end:
        raise AppError(code="INVALID_RANGE", message="start must be on or before end.", status_code=400)
    if (range_end - range_start).days + 1 > 366:
        raise AppError(code="RANGE_TOO_LARGE", message="Date range cannot exceed 366 days.", status_code=400)

    user_email = None
    if user_id is not None:
        user_email = db.query(User.email).filter(User.id == user_id).scalar()
        if user_email is None:
            raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)

    result = _compute_analytics(db, range_start, range_end, user_id, user_email)
    if compare:
        span = (range_end - range_start).days + 1
        previous_end = range_start - timedelta(days=1)
        result["previous"] = _compute_analytics(
            db, previous_end - timedelta(days=span - 1), previous_end, user_id, user_email
        )
    return result


# ── User management ────────────────────────────────────────────────────────────

def _user_query(db: Session, q: str, status: str, role: str):
    query = db.query(User)
    if q:
        query = query.filter(User.email.ilike(f"%{q}%"))
    if status == "active":
        query = query.filter(User.is_active.is_(True))
    elif status == "suspended":
        query = query.filter(User.is_active.is_(False))
    if role == "admin":
        query = query.filter(User.is_admin.is_(True))
    elif role == "user":
        query = query.filter(User.is_admin.is_(False))
    return query


def _serialize_users(db: Session, users: list[User]) -> list[AdminUser]:
    emails = [u.email for u in users]
    user_ids = [u.id for u in users]

    doc_counts = dict(
        db.query(Document.user_email, func.count(Document.id))
        .filter(Document.user_email.in_(emails))
        .group_by(Document.user_email)
        .all()
    ) if emails else {}
    session_counts = dict(
        db.query(ChatSession.user_id, func.count(ChatSession.id))
        .filter(ChatSession.user_id.in_(user_ids))
        .group_by(ChatSession.user_id)
        .all()
    ) if user_ids else {}
    last_active = dict(
        db.query(UsageEvent.user_id, func.max(UsageEvent.created_at))
        .filter(UsageEvent.user_id.in_(user_ids))
        .group_by(UsageEvent.user_id)
        .all()
    ) if user_ids else {}

    return [
        AdminUser(
            id=u.id,
            email=u.email,
            is_active=u.is_active,
            is_admin=u.is_admin,
            email_verified=u.email_verified,
            created_at=u.created_at,
            document_count=doc_counts.get(u.email, 0),
            session_count=session_counts.get(u.id, 0),
            last_active_at=last_active.get(u.id),
        )
        for u in users
    ]


@router.get("/users", response_model=AdminUserList)
def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    q: str = Query(default="", description="Filter by email substring"),
    status: Literal["all", "active", "suspended"] = Query(default="all"),
    role: Literal["all", "admin", "user"] = Query(default="all"),
    sort: Literal["newest", "oldest", "email"] = Query(default="newest"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = _user_query(db, q, status, role)
    total = query.count()
    if sort == "oldest":
        query = query.order_by(User.created_at.asc())
    elif sort == "email":
        query = query.order_by(User.email.asc())
    else:
        query = query.order_by(User.created_at.desc())
    users = query.offset(skip).limit(limit).all()
    return AdminUserList(users=_serialize_users(db, users), total=total, skip=skip, limit=limit)


@router.get("/users/export")
def export_users_csv(
    q: str = Query(default=""),
    status: Literal["all", "active", "suspended"] = Query(default="all"),
    role: Literal["all", "admin", "user"] = Query(default="all"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Download the (filtered) user list as CSV."""
    users = _user_query(db, q, status, role).order_by(User.created_at.desc()).all()
    rows = _serialize_users(db, users)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "email", "status", "role", "email_verified", "created_at", "documents", "sessions", "last_active_at"])
    for u in rows:
        writer.writerow(
            [
                u.id,
                u.email,
                "active" if u.is_active else "suspended",
                "admin" if u.is_admin else "user",
                "yes" if u.email_verified else "no",
                u.created_at.isoformat() if u.created_at else "",
                u.document_count,
                u.session_count,
                u.last_active_at.isoformat() if u.last_active_at else "",
            ]
        )
    record_admin_action(db, admin_email=admin.email, action="users.export", details={"count": len(rows)})
    buffer.seek(0)
    filename = f"querex-users-{_utcnow_naive().date().isoformat()}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)
    return user


def _assert_not_last_admin(db: Session, user: User) -> None:
    if not user.is_admin:
        return
    admin_count = db.query(func.count(User.id)).filter(User.is_admin.is_(True)).scalar() or 0
    if admin_count <= 1:
        raise AppError(
            code="LAST_ADMIN",
            message="This is the only admin account. Promote another user to admin before demoting, "
            "suspending, or deleting this one.",
            status_code=400,
        )


@router.patch("/users/{user_id}", response_model=MessageResponse)
def patch_user(
    user_id: int,
    body: UserPatch,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = _get_user_or_404(db, user_id)

    # An admin cannot lock themselves out — prevents orphaning the panel.
    if user.id == admin.id and (body.is_active is False or body.is_admin is False):
        raise AppError(
            code="CANNOT_MODIFY_SELF",
            message="You cannot suspend or demote your own admin account.",
            status_code=400,
        )

    # The platform must always retain at least one admin.
    if body.is_admin is False or body.is_active is False:
        _assert_not_last_admin(db, user)

    changes: dict[str, bool] = {}
    if body.is_active is not None and body.is_active != user.is_active:
        user.is_active = body.is_active
        changes["is_active"] = body.is_active
        if not body.is_active:
            # Suspension must take effect on the next token refresh, not 30 days later.
            db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False)).update(
                {"revoked": True}, synchronize_session=False
            )
    if body.is_admin is not None and body.is_admin != user.is_admin:
        user.is_admin = body.is_admin
        changes["is_admin"] = body.is_admin
    if body.email_verified is not None and body.email_verified != user.email_verified:
        user.email_verified = body.email_verified
        changes["email_verified"] = body.email_verified

    if not changes:
        raise AppError(code="NO_CHANGES", message="No fields to update", status_code=400)

    db.commit()
    record_admin_action(db, admin_email=admin.email, action="user.update", target=user.email, details=changes)
    summary = ", ".join(f"{k}={v}" for k, v in changes.items())
    return MessageResponse(message=f"User updated: {summary}")


@router.post("/users/{user_id}/revoke-sessions", response_model=MessageResponse)
def revoke_user_sessions(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Sign the user out everywhere by revoking every refresh token. Their
    current access token keeps working until it expires (max 60 minutes)."""
    user = _get_user_or_404(db, user_id)
    revoked = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False))
        .update({"revoked": True}, synchronize_session=False)
    )
    db.commit()
    record_admin_action(db, admin_email=admin.email, action="user.revoke_sessions", target=user.email, details={"revoked": revoked})
    return MessageResponse(message=f"Revoked {revoked} active session(s) for {user.email}")


def _delete_one_user(user_id: int, admin: User, db: Session, auth_service: AuthService) -> str:
    """Shared by the single and bulk delete endpoints so both apply the
    exact same safety guards. Returns the deleted user's email, or raises
    AppError (caught per-item by the bulk endpoint, propagated as-is by
    the single one)."""
    user = _get_user_or_404(db, user_id)
    if user.id == admin.id:
        raise AppError(
            code="CANNOT_DELETE_SELF",
            message="Delete your own account from profile settings, not the admin panel.",
            status_code=400,
        )
    _assert_not_last_admin(db, user)

    target_email = user.email
    auth_service.delete_account(email=target_email)
    record_admin_action(db, admin_email=admin.email, action="user.delete", target=target_email)
    return target_email


@router.delete("/users/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service),
):
    target_email = _delete_one_user(user_id, admin, db, auth_service)
    return MessageResponse(message=f"User {target_email} and all their data deleted")


class BulkDeleteUsersRequest(BaseModel):
    user_ids: list[int] = Field(min_length=1, max_length=100)


class BulkDeleteFailure(BaseModel):
    user_id: int
    error: str


class BulkDeleteUsersResponse(BaseModel):
    deleted: list[str]
    failed: list[BulkDeleteFailure]


@router.post("/users/bulk-delete", response_model=BulkDeleteUsersResponse)
def bulk_delete_users(
    body: BulkDeleteUsersRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service),
):
    """Delete multiple accounts in one call. Applies the exact same guards
    as deleting one at a time (can't delete yourself, can't delete the
    last admin) - one failing entry (e.g. an ID that turns out to be the
    last admin) does not abort the rest of the batch; every ID is
    attempted independently and both outcomes are reported."""
    deleted: list[str] = []
    failed: list[BulkDeleteFailure] = []
    for user_id in dict.fromkeys(body.user_ids):  # de-dupe, preserve order
        try:
            deleted.append(_delete_one_user(user_id, admin, db, auth_service))
        except AppError as exc:
            db.rollback()
            failed.append(BulkDeleteFailure(user_id=user_id, error=exc.message))
        except Exception:
            # Defense in depth: an unexpected DB error (e.g. an
            # unanticipated foreign-key constraint) must not abort every
            # remaining ID in the batch — one real incident deleted 16 of
            # 29 selected users before an uncaught IntegrityError on the
            # 17th silently killed the whole request. Roll back so the
            # session is usable again, report this one as failed, and keep
            # going.
            logger.exception("bulk_delete_users: unexpected error deleting user_id=%s", user_id)
            db.rollback()
            failed.append(BulkDeleteFailure(user_id=user_id, error="Unexpected server error — see logs"))
    return BulkDeleteUsersResponse(deleted=deleted, failed=failed)


@router.get("/users/{user_id}/documents")
def list_user_documents(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Inspect a user's documents — for guiding users through support issues."""
    user = _get_user_or_404(db, user_id)
    storage = get_storage_service()
    docs = db.query(Document).filter(Document.user_email == user.email).order_by(Document.created_at.desc()).all()
    return {
        "documents": [
            {
                "id": d.stored_filename,
                "name": d.original_filename,
                "size_bytes": d.size_bytes,
                "upload_status": d.upload_status,
                "error_message": d.error_message,
                "page_count": d.page_count,
                "file_exists": _safe_exists(storage, d.stored_filename),
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ]
    }


def _safe_exists(storage, stored_filename: str) -> bool:
    try:
        return bool(storage.exists(stored_filename))
    except Exception:
        return False


@router.get("/users/{user_id}/sessions")
def list_user_sessions(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Inspect a user's chat sessions — for guiding users through support issues."""
    _get_user_or_404(db, user_id)

    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .order_by(ChatSession.created_at.desc())
        .all()
    )
    message_counts = dict(
        db.query(ChatMessage.session_id, func.count(ChatMessage.id))
        .filter(ChatMessage.session_id.in_([s.id for s in sessions]))
        .group_by(ChatMessage.session_id)
        .all()
    ) if sessions else {}

    return {
        "sessions": [
            {
                "id": s.id,
                "title": s.title,
                "pinned": s.pinned,
                "message_count": message_counts.get(s.id, 0),
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ]
    }


@router.get("/users/{user_id}/activity")
def get_user_activity(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Cross-tool activity summary for one user (last 30 days of usage)."""
    user = _get_user_or_404(db, user_id)
    since = _utcnow_naive() - timedelta(days=30)

    usage_rows = (
        db.query(UsageEvent.tool, func.count(UsageEvent.id), func.sum(case((UsageEvent.ok.is_(False), 1), else_=0)))
        .filter(UsageEvent.user_id == user.id, UsageEvent.created_at >= since)
        .group_by(UsageEvent.tool)
        .all()
    )
    last_active = db.query(func.max(UsageEvent.created_at)).filter(UsageEvent.user_id == user.id).scalar()
    active_tokens = (
        db.query(func.count(RefreshToken.id))
        .filter(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False))
        .scalar()
        or 0
    )
    return {
        "user_id": user.id,
        "email": user.email,
        "humanizer_runs": int(db.query(func.count(HumanizerRun.id)).filter(HumanizerRun.user_id == user.id).scalar() or 0),
        "realtime_sessions": int(
            db.query(func.count(RealtimeSession.id)).filter(RealtimeSession.user_id == user.id).scalar() or 0
        ),
        "active_refresh_tokens": int(active_tokens),
        "last_active_at": last_active.isoformat() if last_active else None,
        "usage_30d": [
            {"tool": tool, "label": TOOL_LABELS.get(tool, tool), "requests": int(n), "errors": int(err or 0)}
            for tool, n, err in usage_rows
        ],
        "identities": [i.provider for i in user.identities],
    }


# ── Document management ────────────────────────────────────────────────────────

@router.get("/documents", response_model=AdminDocumentList)
def list_all_documents(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    q: str = Query(default="", description="Filter by document name or owner email"),
    status: str = Query(default="all", description="all | ready | processing | failed | empty"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Document)
    if q:
        pattern = f"%{q}%"
        query = query.filter((Document.original_filename.ilike(pattern)) | (Document.user_email.ilike(pattern)))
    if status != "all":
        query = query.filter(Document.upload_status == status)
    total = query.count()
    docs = query.order_by(Document.created_at.desc()).offset(skip).limit(limit).all()
    return AdminDocumentList(
        documents=[
            AdminDocument(
                id=d.stored_filename,
                name=d.original_filename,
                owner_email=d.user_email,
                size_bytes=d.size_bytes,
                upload_status=d.upload_status,
                error_message=d.error_message,
                page_count=d.page_count,
                pinned=bool(d.pinned),
                created_at=d.created_at,
            )
            for d in docs
        ],
        total=total,
        skip=skip,
        limit=limit,
    )


def _get_document_or_404(db: Session, document_id: str) -> Document:
    doc = db.query(Document).filter(Document.stored_filename == document_id).first()
    if not doc:
        raise AppError(code="DOCUMENT_NOT_FOUND", message="Document not found", status_code=404)
    return doc


@router.delete("/documents/{document_id}", response_model=MessageResponse)
def delete_any_document(
    document_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    service: DocumentService = Depends(get_document_service),
):
    """Remove a document (file, vectors, and row) on the owner's behalf."""
    doc = _get_document_or_404(db, document_id)
    name, owner = doc.original_filename, doc.user_email
    service.delete_document(filename=document_id, user_email=owner or "")
    record_admin_action(db, admin_email=admin.email, action="document.delete", target=name, details={"owner": owner})
    return MessageResponse(message=f"Deleted {name}")


@router.post("/documents/{document_id}/reingest", response_model=MessageResponse)
def reingest_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    service: DocumentService = Depends(get_document_service),
):
    """Re-run ingestion for a document whose first pass failed or produced
    nothing (e.g. after a vision/embedding outage). Existing chunks are
    dropped first so a retry never duplicates them."""
    doc = _get_document_or_404(db, document_id)
    if doc.upload_status == "processing":
        raise AppError(code="ALREADY_PROCESSING", message="This document is already being processed", status_code=409)

    try:
        get_vector_store_manager().delete_by_source(document_id)
    except Exception:
        logger.exception("admin_reingest_vector_cleanup_failed stored=%s", document_id)

    doc.upload_status = "processing"
    doc.error_message = None
    db.commit()
    background_tasks.add_task(service.process_upload_background, document_id)
    record_admin_action(
        db, admin_email=admin.email, action="document.reingest", target=doc.original_filename, details={"owner": doc.user_email}
    )
    return MessageResponse(message=f"Re-ingestion started for {doc.original_filename}")


# ── Runtime settings ───────────────────────────────────────────────────────────

@router.get("/settings", response_model=list[SettingDescriptor])
def get_runtime_settings(admin: User = Depends(require_admin)):
    return describe_settings()


@router.put("/settings", response_model=list[SettingDescriptor])
def update_runtime_settings(
    body: SettingsUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    # A page can never be saved into "static" mode with nothing to show --
    # enforced here, not just left to the admin UI's own upload-before-save
    # gating, so a direct API call can't create the broken state either.
    for key, value in body.settings.items():
        if key.startswith("bg_mode_") and value == "static":
            page = key[len("bg_mode_"):]
            if db.get(AppSetting, f"{_BG_IMAGE_KEY_PREFIX}{page}") is None:
                raise AppError(
                    code="NO_BACKGROUND_IMAGE",
                    message=f"Upload an image for {page.replace('_', ' ')} before switching it to static.",
                    status_code=400,
                )
    for key, value in body.settings.items():
        runtime_settings.set(db, key, value)
    record_admin_action(db, admin_email=admin.email, action="settings.update", details=dict(body.settings))
    return describe_settings()


@router.get("/settings/categories")
def get_setting_categories(admin: User = Depends(require_admin)):
    return [{"key": key, "label": label} for key, label in CATEGORY_LABELS.items()]


# ── Per-page background images ──────────────────────────────────────────────────
# 2026-09-20: the image bytes live in object storage (StorageService — R2 in
# prod), never in this DB row and never in a publicly-readable bucket (that
# bucket is deliberately private, per the July security audit). This just
# tracks WHICH stored object is current for each page, as a plain AppSetting
# row keyed "_bg_image_<page>" -- written here directly rather than through
# the typed runtime_settings/_defs() system, specifically so it never shows
# up as an editable field in the generic admin Settings UI (it's bookkeeping,
# not a setting a human should hand-type). GET /app/background/{page} (see
# app_config.py) is the one place that reads it back, to stream the bytes to
# a public, unauthenticated request without the storage backend itself ever
# being public.
_BG_IMAGE_KEY_PREFIX = "_bg_image_"
_BG_MAX_BYTES = 8 * 1024 * 1024
_BG_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
# 2026-09-20: background images are full-viewport, fixed, and loaded on
# every single page view -- an admin uploading a straight-off-a-phone 4-6MB
# photo would make every visitor pay that download on first paint for a
# purely decorative element. Compressed server-side before it ever reaches
# object storage, not left to the admin to pre-shrink themselves.
_BG_TARGET_MAX_BYTES = 100 * 1024
_BG_MAX_DIMENSION = 2000  # px, longest side -- these render as a page backdrop, never viewed at native size


def _compress_background_image(content: bytes) -> bytes:
    """Resizes/recompresses to _BG_TARGET_MAX_BYTES. Always re-encodes to
    WebP regardless of the input format -- WebP's lossy mode reliably hits a
    much smaller size than PNG at a given visual quality, and one consistent
    output format keeps this simple (no per-format branching downstream:
    serving, content-type, extension). Bounded, real iteration rather than
    guessing one right quality setting: downscale first (dimensions matter
    far more than quality percentage at any acceptable quality), then step
    quality down; if even the floor quality is still over budget on an
    unusually large/detailed source, one more aggressive downscale pass
    rather than looping indefinitely chasing a target quality alone can't reach.
    Raises AppError if the bytes aren't a real image the declared content-type
    claimed them to be (Pillow can't open them)."""
    try:
        image = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as exc:
        raise AppError(code="INVALID_FILE_TYPE", message="File is not a valid image", status_code=400) from exc

    if max(image.size) > _BG_MAX_DIMENSION:
        image.thumbnail((_BG_MAX_DIMENSION, _BG_MAX_DIMENSION), Image.LANCZOS)

    for quality in (85, 75, 65, 55, 45, 35, 25, 18, 12):
        buf = io.BytesIO()
        image.save(buf, format="WEBP", quality=quality, method=6)
        data = buf.getvalue()
        if len(data) <= _BG_TARGET_MAX_BYTES:
            return data

    image.thumbnail((1200, 1200), Image.LANCZOS)
    buf = io.BytesIO()
    image.save(buf, format="WEBP", quality=12, method=6)
    return buf.getvalue()


@router.post("/background/{page}")
async def upload_background_image(
    page: str,
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if page not in BACKGROUND_PAGES:
        raise AppError(code="UNKNOWN_PAGE", message=f"Unknown page: {page}", status_code=400)
    if (file.content_type or "") not in _BG_ALLOWED_CONTENT_TYPES:
        raise AppError(
            code="INVALID_FILE_TYPE", message="Only JPEG, PNG, or WebP images are allowed", status_code=400
        )
    content = await file.read()
    if len(content) > _BG_MAX_BYTES:
        raise AppError(code="FILE_TOO_LARGE", message="Image exceeds the 8 MB limit", status_code=413)

    content = _compress_background_image(content)

    storage = get_storage_service()
    settings_key = f"{_BG_IMAGE_KEY_PREFIX}{page}"
    row = db.get(AppSetting, settings_key)
    previous_stored_key = row.value if row else None

    # Always .webp -- _compress_background_image always re-encodes to it
    # regardless of the uploaded format.
    stored_key = f"branding/background-{page}-{uuid.uuid4()}.webp"
    storage.save(stored_key, content)

    if row:
        row.value = stored_key
    else:
        db.add(AppSetting(key=settings_key, value=stored_key))
    db.commit()

    # Best-effort: an old image left behind if this fails costs storage, not
    # correctness (the new one is already live) -- not worth failing the
    # request over.
    if previous_stored_key:
        try:
            storage.delete(previous_stored_key)
        except Exception:
            logger.warning("background_image_cleanup_failed page=%s key=%s", page, previous_stored_key, exc_info=True)

    record_admin_action(db, admin_email=admin.email, action="background.upload", target=page)
    # Same versioning scheme as GET /app/config's backgrounds[page].image_url
    # (see app_config.py) -- the path never changes between uploads, so the
    # version query param is what actually busts the 1-hour browser cache on
    # a re-upload. rsplit on "/" not "-": stored_key's own uuid4 segment
    # contains hyphens, splitting on those would truncate it.
    return {"page": page, "image_url": f"/app/background/{page}?v={stored_key.rsplit('/', 1)[-1]}"}


@router.delete("/background/{page}")
def delete_background_image(page: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if page not in BACKGROUND_PAGES:
        raise AppError(code="UNKNOWN_PAGE", message=f"Unknown page: {page}", status_code=400)
    settings_key = f"{_BG_IMAGE_KEY_PREFIX}{page}"
    row = db.get(AppSetting, settings_key)
    if not row:
        raise AppError(code="NOT_FOUND", message="No image uploaded for this page", status_code=404)

    storage = get_storage_service()
    try:
        storage.delete(row.value)
    except Exception:
        logger.warning("background_image_delete_failed page=%s key=%s", page, row.value, exc_info=True)
    db.delete(row)
    # A page can't stay in "static" mode with nothing to show -- fall back to
    # dynamic automatically rather than leaving a broken image reference live.
    if runtime_settings.get(f"bg_mode_{page}") == "static":
        runtime_settings.set(db, f"bg_mode_{page}", "dynamic")
    db.commit()
    record_admin_action(db, admin_email=admin.email, action="background.delete", target=page)
    return MessageResponse(message=f"Background image removed for {page}")


# ── Brand logo ───────────────────────────────────────────────────────────────────
# 2026-09-21: same bookkeeping-row pattern as the per-page background images
# above (a single global one, not per-page) -- an admin-uploaded mark that
# replaces the built-in sparkle glyph everywhere it's shown (landing nav +
# footer, legal pages nav, the logged-in app's top nav, and the login page).
# GET /app/logo (app_config.py) streams it back publicly, unauthenticated,
# same as the background route.
_LOGO_IMAGE_KEY = "_logo_image_"
_LOGO_MAX_BYTES = 4 * 1024 * 1024
_LOGO_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
# Small and typically viewed at ~32-40px, but rendered at up to 2x for retina
# -- 512px is generous headroom without bloating storage/transfer for
# something shown on every single page load, everywhere.
_LOGO_TARGET_MAX_BYTES = 60 * 1024
_LOGO_MAX_DIMENSION = 512


def _compress_logo_image(content: bytes) -> bytes:
    """Same bounded resize/recompress loop as _compress_background_image, but
    keeps the alpha channel (RGBA, not RGB) -- a logo is composited over
    whatever accent color sits behind it in each placement, so transparency
    actually matters here, unlike a full-bleed page background."""
    try:
        image = Image.open(io.BytesIO(content)).convert("RGBA")
    except Exception as exc:
        raise AppError(code="INVALID_FILE_TYPE", message="File is not a valid image", status_code=400) from exc

    if max(image.size) > _LOGO_MAX_DIMENSION:
        image.thumbnail((_LOGO_MAX_DIMENSION, _LOGO_MAX_DIMENSION), Image.LANCZOS)

    for quality in (90, 80, 70, 60, 50, 40, 30, 20):
        buf = io.BytesIO()
        image.save(buf, format="WEBP", quality=quality, method=6)
        data = buf.getvalue()
        if len(data) <= _LOGO_TARGET_MAX_BYTES:
            return data

    image.thumbnail((256, 256), Image.LANCZOS)
    buf = io.BytesIO()
    image.save(buf, format="WEBP", quality=20, method=6)
    return buf.getvalue()


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if (file.content_type or "") not in _LOGO_ALLOWED_CONTENT_TYPES:
        raise AppError(
            code="INVALID_FILE_TYPE", message="Only JPEG, PNG, or WebP images are allowed", status_code=400
        )
    content = await file.read()
    if len(content) > _LOGO_MAX_BYTES:
        raise AppError(code="FILE_TOO_LARGE", message="Image exceeds the 4 MB limit", status_code=413)

    content = _compress_logo_image(content)

    storage = get_storage_service()
    row = db.get(AppSetting, _LOGO_IMAGE_KEY)
    previous_stored_key = row.value if row else None

    stored_key = f"branding/logo-{uuid.uuid4()}.webp"
    storage.save(stored_key, content)

    if row:
        row.value = stored_key
    else:
        db.add(AppSetting(key=_LOGO_IMAGE_KEY, value=stored_key))
    db.commit()

    if previous_stored_key:
        try:
            storage.delete(previous_stored_key)
        except Exception:
            logger.warning("logo_image_cleanup_failed key=%s", previous_stored_key, exc_info=True)

    record_admin_action(db, admin_email=admin.email, action="logo.upload")
    return {"logo_url": f"/app/logo?v={stored_key.rsplit('/', 1)[-1]}"}


@router.delete("/logo")
def delete_logo(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.get(AppSetting, _LOGO_IMAGE_KEY)
    if not row:
        raise AppError(code="NOT_FOUND", message="No logo has been uploaded", status_code=404)

    storage = get_storage_service()
    try:
        storage.delete(row.value)
    except Exception:
        logger.warning("logo_image_delete_failed key=%s", row.value, exc_info=True)
    db.delete(row)
    db.commit()
    record_admin_action(db, admin_email=admin.email, action="logo.delete")
    return MessageResponse(message="Logo removed — the default mark is shown again")


# ── Audit log & usage events ───────────────────────────────────────────────────

@router.get("/audit-log", response_model=AuditLogResponse)
def get_audit_log(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    action: str = Query(default="", description="Filter by action prefix, e.g. 'user.'"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(AdminAuditLog)
    if action:
        query = query.filter(AdminAuditLog.action.like(f"{action}%"))
    total = query.count()
    rows = query.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()).offset(skip).limit(limit).all()
    return AuditLogResponse(
        entries=[
            AuditEntry(
                id=r.id,
                admin_email=r.admin_email,
                action=r.action,
                target=r.target,
                details=r.details,
                created_at=r.created_at,
            )
            for r in rows
        ],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/usage-events", response_model=UsageEventList)
def get_usage_events(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    tool: str = Query(default=""),
    errors_only: bool = Query(default=False),
    user_id: int | None = Query(default=None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(UsageEvent, User.email).outerjoin(User, User.id == UsageEvent.user_id)
    if tool:
        query = query.filter(UsageEvent.tool == tool)
    if errors_only:
        query = query.filter(UsageEvent.ok.is_(False))
    if user_id is not None:
        query = query.filter(UsageEvent.user_id == user_id)
    total = query.count()
    rows = query.order_by(UsageEvent.created_at.desc(), UsageEvent.id.desc()).offset(skip).limit(limit).all()
    return UsageEventList(
        events=[
            UsageEventOut(
                id=e.id,
                tool=e.tool,
                user_email=email,
                status_code=e.status_code,
                ok=e.ok,
                duration_ms=e.duration_ms,
                request_id=e.request_id,
                created_at=e.created_at,
            )
            for e, email in rows
        ],
        total=total,
        skip=skip,
        limit=limit,
    )


# ── System ─────────────────────────────────────────────────────────────────────

# 2026-09-20: real limits, fetched live from each provider's own pricing page
# (not estimated) -- Neon's free plan: "0.5 GB/project" storage, hard cap that
# blocks writes once exceeded (confirmed this account is on the free plan, not
# assumed). Cloudflare R2 free tier: "10 GB-month / month" storage. Both are
# storage limits specifically -- compute-hours/request-count limits exist too
# but aren't shown here since this panel only answers "how much storage is
# left", the question this was built for.
_NEON_FREE_STORAGE_BYTES = 512 * 1024 * 1024
_R2_FREE_STORAGE_BYTES = 10 * 1024 * 1024 * 1024
_TOP_TABLES_LIMIT = 10


@router.get("/system/storage")
def get_storage_usage(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Real, live storage usage for the two backing stores -- Postgres (Neon)
    and object storage (R2) -- against their real free-tier limits. Answers
    "how much are we using, how much is left" with actual numbers, not
    estimates. Neon's per-table breakdown only works on the real Postgres
    dialect (pg_database_size/pg_stat_user_tables); on local SQLite dev this
    section comes back null rather than erroring."""
    neon: dict | None = None
    if engine.dialect.name == "postgresql":
        total_bytes = db.execute(text("SELECT pg_database_size(current_database())")).scalar() or 0
        rows = db.execute(
            text(
                """
                SELECT relname, n_live_tup, pg_total_relation_size(relid)
                FROM pg_stat_user_tables
                ORDER BY pg_total_relation_size(relid) DESC
                LIMIT :limit
                """
            ),
            {"limit": _TOP_TABLES_LIMIT},
        ).fetchall()
        neon = {
            "used_bytes": int(total_bytes),
            "limit_bytes": _NEON_FREE_STORAGE_BYTES,
            "percent_used": round(100 * int(total_bytes) / _NEON_FREE_STORAGE_BYTES, 1),
            "top_tables": [{"name": r[0], "row_count": int(r[1]), "bytes": int(r[2])} for r in rows],
        }

    r2: dict | None = None
    settings = get_settings()
    if all([settings.r2_account_id, settings.r2_access_key_id, settings.r2_secret_access_key, settings.r2_bucket_name]):
        summary = get_storage_service().usage_summary()
        r2 = {
            "used_bytes": summary["used_bytes"],
            "limit_bytes": _R2_FREE_STORAGE_BYTES,
            "percent_used": round(100 * summary["used_bytes"] / _R2_FREE_STORAGE_BYTES, 2),
            "object_count": summary["object_count"],
            "by_prefix": summary["by_prefix"],
        }

    return {"neon": neon, "r2": r2}


@router.get("/system")
def get_system_info(
    probe: bool = Query(default=False, description="Also ping OpenAI and Ollama (slower)"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    ai_service: AIService = Depends(get_ai_service),
):
    """Configuration and health snapshot. Never returns secrets — only
    whether each integration is configured, and (with probe=true) whether
    it currently answers."""
    settings = get_settings()

    try:
        alembic_version = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception:
        alembic_version = None
    database_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        database_ok = False

    vector_ok: bool | None = None
    try:
        vector_ok = bool(get_vector_store_manager().ping())
    except Exception:
        vector_ok = False

    r2_configured = all(
        [settings.r2_account_id, settings.r2_access_key_id, settings.r2_secret_access_key, settings.r2_bucket_name]
    )

    openai_ok: bool | None = None
    ollama_ok: bool | None = None
    tavily_usage: dict | None = None
    resend_recent: dict | None = None
    if probe:
        try:
            openai_ok = bool(ai_service.ping())
        except Exception:
            openai_ok = False
        try:
            resp = httpx.get(f"{settings.humanizer_ultra_ollama_url.rstrip('/')}/api/tags", timeout=2.0)
            ollama_ok = resp.status_code == 200
        except Exception:
            ollama_ok = False
        # 2026-09-22: unlike OpenAI/Sentry (which need a separate, higher-
        # privilege key we don't hold), Tavily's /usage and Resend's list-
        # emails both work with the exact same secret key already configured
        # for real requests -- verified against each provider's own API
        # docs before writing this, not assumed. So these two get real,
        # live numbers instead of just a "configured" badge.
        if settings.tavily_api_key:
            try:
                resp = httpx.get(
                    "https://api.tavily.com/usage",
                    headers={"Authorization": f"Bearer {settings.tavily_api_key}"},
                    timeout=3.0,
                )
                if resp.status_code == 200:
                    body = resp.json()
                    account = body.get("account", {})
                    tavily_usage = {
                        "ok": True,
                        "plan": account.get("current_plan"),
                        "plan_usage": account.get("plan_usage"),
                        "plan_limit": account.get("plan_limit"),
                    }
                else:
                    logger.warning("tavily_usage_probe_failed status=%s body=%s", resp.status_code, resp.text[:500])
                    tavily_usage = {"ok": False}
            except Exception:
                logger.exception("tavily_usage_probe_failed")
                tavily_usage = {"ok": False}
        if settings.resend_api_key:
            try:
                resp = httpx.get(
                    "https://api.resend.com/emails?limit=100",
                    headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                    timeout=3.0,
                )
                if resp.status_code == 200:
                    body = resp.json()
                    emails = body.get("data", [])
                    last_events: dict[str, int] = {}
                    for e in emails:
                        ev = e.get("last_event") or "unknown"
                        last_events[ev] = last_events.get(ev, 0) + 1
                    resend_recent = {
                        "ok": True,
                        "sample_size": len(emails),
                        "has_more": body.get("has_more", False),
                        "by_status": last_events,
                        "most_recent_at": emails[0]["created_at"] if emails else None,
                    }
                elif resp.status_code == 401 and resp.json().get("name") == "restricted_api_key":
                    # Expected, not a bug: this key is deliberately scoped to
                    # sending-only (see CLAUDE.md) and Resend's list-emails
                    # endpoint is a read operation that scope doesn't grant.
                    # Widening the key just to populate this card would undo
                    # a real security decision, so surface it as its own
                    # state instead of a generic failure.
                    resend_recent = {"ok": False, "restricted": True}
                else:
                    logger.warning("resend_recent_probe_failed status=%s body=%s", resp.status_code, resp.text[:500])
                    resend_recent = {"ok": False}
            except Exception:
                logger.exception("resend_recent_probe_failed")
                resend_recent = {"ok": False}
        if settings.uptimerobot_api_key:
            try:
                resp = httpx.post(
                    "https://api.uptimerobot.com/v2/getMonitors",
                    data={
                        "api_key": settings.uptimerobot_api_key,
                        "format": "json",
                        "custom_uptime_ratios": "30",
                    },
                    timeout=3.0,
                )
                body = resp.json() if resp.status_code == 200 else {}
                if resp.status_code == 200 and body.get("stat") == "ok":
                    # Official status codes (UptimeRobot API v2 docs):
                    # 0 paused, 1 not checked yet, 2 up, 8 seems down, 9 down.
                    status_labels = {0: "paused", 1: "not checked yet", 2: "up", 8: "seems down", 9: "down"}
                    uptimerobot_monitors = {
                        "ok": True,
                        "monitors": [
                            {
                                "name": m.get("friendly_name"),
                                "status": status_labels.get(m.get("status"), f"unknown ({m.get('status')})"),
                                "uptime_30d": m.get("custom_uptime_ratio"),
                            }
                            for m in body.get("monitors", [])
                        ],
                    }
                else:
                    logger.warning("uptimerobot_probe_failed status=%s body=%s", resp.status_code, resp.text[:500])
                    uptimerobot_monitors = {"ok": False}
            except Exception:
                logger.exception("uptimerobot_probe_failed")
                uptimerobot_monitors = {"ok": False}
        else:
            uptimerobot_monitors = None
    else:
        uptimerobot_monitors = None

    retention_row = db.get(AppSetting, "retention_last_run_at")

    if settings.resend_api_key:
        email_provider = "resend"
    elif settings.smtp_host:
        email_provider = "smtp"
    else:
        email_provider = "dev-echo"

    # 2026-09-20: every real external service this project uses, one list --
    # not just the ones with a usage number we can pull live. Neon/R2 are
    # tracked directly (GET /admin/system/storage), so they point back at
    # that instead of an external link; everything else can only be checked
    # on the provider's own dashboard -- no self-serve usage API exists for
    # most of these without a separate, higher-privilege key we don't hold
    # (e.g. OpenAI's usage endpoint needs an org admin key, not a regular
    # secret key). Google/Groq/Anthropic are read straight from the
    # environment, not app.core.config.Settings -- real, not a guess: these
    # three are only ever used by the offline finetune tooling
    # (scripts/finetune/aiify_api.py, tag.py), never by the live app itself.
    #
    # load_dotenv() first is required here, not optional -- pydantic-settings
    # reads backend/.env into its own Settings object but never exports it to
    # the real process os.environ, so a bare os.environ.get() below would
    # silently read as unconfigured even with a real key present in .env.
    # This exact bug already bit this project once (see aiify_api.py's own
    # 2026-08-07 comment: "GROQ_API_KEY silently invisible to os.environ.get,
    # causing a fallback to a paid API instead of free Groq") -- avoiding a
    # repeat of it here, not assuming this would otherwise just work.
    from dotenv import load_dotenv

    load_dotenv()
    external_apis = [
        {
            "name": "OpenAI",
            "category": "Live app (chat, checker, humanizer)",
            "configured": bool(settings.openai_api_key),
            "tracked_here": False,
            "dashboard_url": "https://platform.openai.com/usage",
        },
        {
            "name": "Modal (Ultra Human GPU hosting)",
            "category": "Live app",
            "configured": bool(settings.humanizer_ultra_modal_key),
            "tracked_here": False,
            "dashboard_url": "https://modal.com/apps",
        },
        {
            "name": "Tavily",
            "category": "Live app (Real-time AI web search)",
            "configured": bool(settings.tavily_api_key),
            "tracked_here": False,
            "dashboard_url": "https://app.tavily.com",
        },
        {
            "name": "Resend",
            "category": "Live app (transactional email)",
            "configured": bool(settings.resend_api_key),
            "tracked_here": False,
            "dashboard_url": "https://resend.com/emails",
        },
        {
            "name": "Sentry",
            "category": "Live app (error monitoring, backend + frontend)",
            "configured": bool(settings.sentry_dsn),
            "tracked_here": False,
            "dashboard_url": "https://sentry.io",
        },
        {
            "name": "UptimeRobot",
            "category": "Operational (uptime monitoring, not called by the app itself)",
            "configured": bool(settings.uptimerobot_api_key),
            "tracked_here": True,
            "dashboard_url": "https://uptimerobot.com/dashboard",
        },
        {
            "name": "Neon (Postgres)",
            "category": "Live app (database)",
            "configured": True,
            "tracked_here": True,
            "dashboard_url": "https://console.neon.tech",
        },
        {
            "name": "Cloudflare R2",
            "category": "Live app (object storage)",
            "configured": r2_configured,
            "tracked_here": True,
            "dashboard_url": "https://dash.cloudflare.com",
        },
        {
            "name": "Google AI (Gemini)",
            "category": "Finetune tooling only, not the live app",
            "configured": bool(os.environ.get("GOOGLE_API_KEY")),
            "tracked_here": False,
            "dashboard_url": "https://aistudio.google.com/usage",
        },
        {
            "name": "Groq",
            "category": "Finetune tooling only, not the live app",
            "configured": bool(os.environ.get("GROQ_API_KEY")),
            "tracked_here": False,
            "dashboard_url": "https://console.groq.com/settings/billing",
        },
        {
            "name": "Anthropic",
            "category": "Finetune tooling only, not the live app",
            "configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
            "tracked_here": False,
            "dashboard_url": "https://console.anthropic.com/settings/billing",
        },
    ]

    return {
        "app_name": settings.app_name,
        "environment": settings.environment,
        "debug": settings.debug,
        "python_version": sys.version.split()[0],
        "platform": platform.platform(),
        "uptime_seconds": int(time.time() - _STARTED_AT),
        "rate_limit_enabled": settings.rate_limit_enabled,
        "database": {"dialect": engine.dialect.name, "ok": database_ok, "alembic_version": alembic_version},
        "vector_store": {"ok": vector_ok},
        "storage": {"backend": "r2" if r2_configured else "local", "uploads_dir": None if r2_configured else settings.uploads_dir},
        "openai": {"configured": bool(settings.openai_api_key), "chat_model": settings.openai_chat_model, "ok": openai_ok},
        "humanizer": {
            "rewrite_model": settings.humanizer_rewrite_model,
            "classify_model": settings.humanizer_classify_model,
            "candidates": settings.humanizer_num_candidates,
            "ultra_model": settings.humanizer_ultra_model,
            "ultra_ollama_url": settings.humanizer_ultra_ollama_url,
            "ultra_ok": ollama_ok,
        },
        "web_search": {"configured": bool(settings.tavily_api_key), "usage": tavily_usage},
        "email": {"provider": email_provider, "from": settings.email_from, "recent": resend_recent},
        "uptimerobot": {"configured": bool(settings.uptimerobot_api_key), "monitors": uptimerobot_monitors},
        "oauth": {
            "google": bool(settings.google_client_id and settings.google_client_secret),
            "github": bool(settings.github_client_id and settings.github_client_secret),
        },
        "admin_bootstrap_emails": len(settings.admin_email_list),
        "retention": {
            "days": int(runtime_settings.get("retention_days")),
            "last_run_at": retention_row.value if retention_row else None,
        },
        "external_apis": external_apis,
    }


@router.post("/retention/run")
def run_retention_now(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Run the retention cleanup immediately (normally it runs once a day,
    triggered by the uptime ping)."""
    summary = run_cleanup()
    record_admin_action(db, admin_email=admin.email, action="retention.run", details=summary)
    return {"message": "Retention cleanup completed", "summary": summary}
