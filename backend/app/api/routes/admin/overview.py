"""Overview stats, analytics and the PDF report."""

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin
from app.db.models.chat_models import ChatMessage, ChatSession
from app.db.models.document import Document
from app.db.models.humanizer_run import HumanizerRun
from app.db.models.realtime_models import RealtimeSession
from app.db.models.usage_event import UsageEvent
from app.db.models.user import User
from app.db.session import get_db
from app.services.admin_analytics import (
    compute_analytics,
    previous_range,
    resolve_range,
    resolve_user,
)
from app.services.admin_alerts import compute_alerts
from app.services.runtime_settings import runtime_settings
from app.services.admin_audit import record_admin_action
from app.services.admin_report import build_report_pdf, collect_report_data, report_filename
from app.api.routes.admin._common import (
    _utcnow_naive,
    AdminStats,
)

logger = logging.getLogger(__name__)
router = APIRouter()

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

@router.get("/alerts")
def get_alerts(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Operational alerts derived from the last hour of tool traffic."""
    return {
        "alerts": compute_alerts(
            db,
            _utcnow_naive(),
            int(runtime_settings.get("alert_error_rate_pct")),
            int(runtime_settings.get("alert_min_requests")),
        )
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
    """Daily time series, per-tool aggregates, and engagement for a UTC day range.

    The window is [start, end] when either is given (a missing end defaults to
    today, a missing start to end - days + 1), otherwise the last *days* days.
    """
    range_start, range_end = resolve_range(days, start, end, _utcnow_naive().date())
    user_email = resolve_user(db, user_id)

    result = compute_analytics(db, range_start, range_end, user_id, user_email)
    if compare:
        previous_start, previous_end = previous_range(range_start, range_end)
        result["previous"] = compute_analytics(db, previous_start, previous_end, user_id, user_email)
    return result


@router.get("/report.pdf")
def download_report(
    days: int = Query(default=30, ge=1, le=365),
    start: date | None = Query(default=None, description="Inclusive UTC start day, YYYY-MM-DD"),
    end: date | None = Query(default=None, description="Inclusive UTC end day, YYYY-MM-DD"),
    user_id: int | None = Query(default=None, ge=1, description="Report on a single user instead of the platform"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """A narrative PDF report (charts, tables, commentary) for a UTC date range."""
    range_start, range_end = resolve_range(days, start, end, _utcnow_naive().date())
    data = collect_report_data(db, range_start, range_end, user_id, admin.email)
    pdf = build_report_pdf(data)
    record_admin_action(
        db,
        admin_email=admin.email,
        action="report.export",
        target=data["user_email"],
        details={"start": range_start.isoformat(), "end": range_end.isoformat(), "bytes": len(pdf)},
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{report_filename(range_start, range_end, user_id)}"',
            "Cache-Control": "no-store",
        },
    )


