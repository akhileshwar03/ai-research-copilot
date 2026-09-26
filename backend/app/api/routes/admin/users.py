"""User management endpoints."""

import csv
import io
import logging
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin
from app.api.dependencies.services import (
    get_auth_service,
)
from app.core.exceptions import AppError
from app.db.models.chat_models import ChatMessage, ChatSession
from app.db.models.document import Document
from app.db.models.humanizer_run import HumanizerRun
from app.db.models.realtime_models import RealtimeSession
from app.db.models.usage_event import UsageEvent
from app.db.models.user import RefreshToken, User
from app.db.session import get_db
from app.services.admin_audit import record_admin_action
from app.services.auth_service import AuthService
from app.services.storage_service import get_storage_service
from app.services.usage_tracking import TOOL_LABELS
from app.api.routes.admin._common import (
    _utcnow_naive,
    AdminUser,
    AdminUserList,
    UserPatch,
    MessageResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()

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
        # The BOM makes Excel read the file as UTF-8 (otherwise non-ASCII emails are garbled).
        iter(["\ufeff" + buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
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


