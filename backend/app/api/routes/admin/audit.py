"""Audit log and usage events."""

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin
from datetime import date, datetime, timezone

from app.db.models.admin_audit_log import AdminAuditLog
from app.db.models.usage_event import UsageEvent
from app.db.models.user import User
from app.db.session import get_db
from app.services.admin_ai_cost import compute_ai_cost
from app.services.admin_analytics import resolve_range, resolve_user
from app.api.routes.admin._common import (
    AuditEntry,
    AuditLogResponse,
    UsageEventOut,
    UsageEventList,
)

logger = logging.getLogger(__name__)
router = APIRouter()

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




@router.get("/ai-usage")
def get_ai_usage(
    days: int = Query(default=30, ge=1, le=365),
    start: date | None = Query(default=None, description="Inclusive UTC start day, YYYY-MM-DD"),
    end: date | None = Query(default=None, description="Inclusive UTC end day, YYYY-MM-DD"),
    user_id: int | None = Query(default=None, ge=1, description="Restrict to one user"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Token totals and *estimated* cost (list prices; see app/services/ai_pricing.py) for a UTC date range,
    broken down by model, tool, top users and day."""
    range_start, range_end = resolve_range(days, start, end, datetime.now(timezone.utc).date())
    resolve_user(db, user_id)
    return compute_ai_cost(db, range_start, range_end, user_id)
