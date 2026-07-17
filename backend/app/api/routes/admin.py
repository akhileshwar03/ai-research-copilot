"""Admin-only endpoints: platform stats, user management, runtime settings.

All routes require a valid access token belonging to a user with is_admin=True
(enforced by the require_admin dependency). Admins are bootstrapped via the
ADMIN_EMAILS env var and can promote other users from here.
"""

import logging
import os
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin
from app.api.dependencies.services import get_auth_service
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.db.models.chat_models import ChatMessage, ChatSession
from app.db.models.document import Document
from app.db.models.user import User
from app.db.session import get_db
from app.services.auth_service import AuthService
from app.services.runtime_settings import describe_settings, runtime_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class AdminStats(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    total_documents: int
    total_storage_bytes: int
    total_sessions: int
    total_messages: int


class AdminUser(BaseModel):
    id: int
    email: str
    is_active: bool
    is_admin: bool
    email_verified: bool
    created_at: datetime | None
    document_count: int
    session_count: int


class AdminUserList(BaseModel):
    users: list[AdminUser]
    total: int
    skip: int
    limit: int


class UserPatch(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None


class SettingDescriptor(BaseModel):
    key: str
    value: float | int
    default: float | int
    min: float
    max: float
    type: str
    description: str


class SettingsUpdate(BaseModel):
    settings: dict[str, float | int]


class MessageResponse(BaseModel):
    message: str


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=AdminStats)
def get_stats(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    storage = db.query(func.coalesce(func.sum(Document.size_bytes), 0)).scalar() or 0
    return AdminStats(
        total_users=db.query(func.count(User.id)).scalar() or 0,
        active_users=db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0,
        admin_users=db.query(func.count(User.id)).filter(User.is_admin.is_(True)).scalar() or 0,
        total_documents=db.query(func.count(Document.id)).scalar() or 0,
        total_storage_bytes=int(storage),
        total_sessions=db.query(func.count(ChatSession.id)).scalar() or 0,
        total_messages=db.query(func.count(ChatMessage.id)).scalar() or 0,
    )


# ── User management ────────────────────────────────────────────────────────────

@router.get("/users", response_model=AdminUserList)
def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    q: str = Query(default="", description="Filter by email substring"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if q:
        query = query.filter(User.email.ilike(f"%{q}%"))

    total = query.count()
    users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()

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

    return AdminUserList(
        users=[
            AdminUser(
                id=u.id,
                email=u.email,
                is_active=u.is_active,
                is_admin=u.is_admin,
                email_verified=u.email_verified,
                created_at=u.created_at,
                document_count=doc_counts.get(u.email, 0),
                session_count=session_counts.get(u.id, 0),
            )
            for u in users
        ],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.patch("/users/{user_id}", response_model=MessageResponse)
def patch_user(
    user_id: int,
    body: UserPatch,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)

    # An admin cannot lock themselves out — prevents orphaning the panel.
    if user.id == admin.id and (body.is_active is False or body.is_admin is False):
        raise AppError(
            code="CANNOT_MODIFY_SELF",
            message="You cannot suspend or demote your own admin account.",
            status_code=400,
        )

    # The platform must always retain at least one admin, so demoting or
    # suspending the last one is blocked — promote a replacement first.
    if user.is_admin and (body.is_admin is False or body.is_active is False):
        admin_count = db.query(func.count(User.id)).filter(User.is_admin.is_(True)).scalar() or 0
        if admin_count <= 1:
            raise AppError(
                code="LAST_ADMIN",
                message="This is the only admin account. Promote another user to admin before demoting or suspending this one.",
                status_code=400,
            )

    changes = []
    if body.is_active is not None:
        user.is_active = body.is_active
        changes.append(f"is_active={body.is_active}")
    if body.is_admin is not None:
        user.is_admin = body.is_admin
        changes.append(f"is_admin={body.is_admin}")

    if not changes:
        raise AppError(code="NO_CHANGES", message="No fields to update", status_code=400)

    db.commit()
    logger.info("admin_user_patched admin=%s target=%s changes=%s", admin.email, user.email, ",".join(changes))
    return MessageResponse(message=f"User updated: {', '.join(changes)}")


@router.delete("/users/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service),
):
    user = db.get(User, user_id)
    if not user:
        raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)
    if user.id == admin.id:
        raise AppError(
            code="CANNOT_DELETE_SELF",
            message="Delete your own account from profile settings, not the admin panel.",
            status_code=400,
        )

    if user.is_admin:
        admin_count = db.query(func.count(User.id)).filter(User.is_admin.is_(True)).scalar() or 0
        if admin_count <= 1:
            raise AppError(
                code="LAST_ADMIN",
                message="This is the only admin account. Promote another user to admin before deleting this one.",
                status_code=400,
            )

    target_email = user.email
    auth_service.delete_account(email=target_email)
    logger.info("admin_user_deleted admin=%s target=%s", admin.email, target_email)
    return MessageResponse(message=f"User {target_email} and all their data deleted")


@router.get("/users/{user_id}/documents")
def list_user_documents(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Inspect a user's documents — for guiding users through support issues."""
    user = db.get(User, user_id)
    if not user:
        raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)

    settings = get_settings()
    docs = db.query(Document).filter(Document.user_email == user.email).all()
    return {
        "documents": [
            {
                "id": d.stored_filename,
                "name": d.original_filename,
                "size_bytes": d.size_bytes,
                "upload_status": d.upload_status,
                "error_message": d.error_message,
                "file_exists": os.path.exists(os.path.join(settings.uploads_dir, d.stored_filename)),
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ]
    }


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
    for key, value in body.settings.items():
        runtime_settings.set(db, key, value)
    logger.info("admin_settings_updated admin=%s keys=%s", admin.email, list(body.settings))
    return describe_settings()
