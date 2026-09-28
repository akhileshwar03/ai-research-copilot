"""Live operational alerts for the admin console, computed from the last hour of usage events."""

from datetime import datetime, timedelta

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.db.models.usage_event import UsageEvent
from app.services.usage_tracking import TOOL_LABELS

WINDOW = timedelta(hours=1)
# A single tool needs this many requests before it can be called "failing" on its own.
MIN_TOOL_REQUESTS = 5
TOOL_FAILURE_PCT = 50


def compute_alerts(db: Session, now: datetime, error_rate_pct: int, min_requests: int) -> list[dict]:
    """Active alerts for [now - 1h, now]. `now` is naive UTC, like the stored timestamps."""
    since = now - WINDOW
    rows = (
        db.query(
            UsageEvent.tool,
            func.count(UsageEvent.id),
            func.sum(case((UsageEvent.is_real_error(), 1), else_=0)),
        )
        .filter(UsageEvent.created_at >= since)
        .group_by(UsageEvent.tool)
        .all()
    )
    total = sum(int(r[1]) for r in rows)
    errors = sum(int(r[2] or 0) for r in rows)
    alerts: list[dict] = []

    if total >= min_requests and errors * 100 >= error_rate_pct * total:
        alerts.append(
            {
                "id": "error-rate",
                "severity": "critical" if errors * 100 >= 2 * error_rate_pct * total else "warning",
                "title": f"Error rate {errors * 100 / total:.0f}% in the last hour",
                "detail": f"{errors} of {total} tool requests failed (alert threshold {error_rate_pct}%).",
            }
        )

    for tool, count, failed in rows:
        count, failed = int(count), int(failed or 0)
        if count >= MIN_TOOL_REQUESTS and failed * 100 >= TOOL_FAILURE_PCT * count:
            label = TOOL_LABELS.get(tool, tool)
            alerts.append(
                {
                    "id": f"tool-failing:{tool}",
                    "severity": "critical",
                    "title": f"{label} is failing",
                    "detail": f"{failed} of {count} {label} requests failed in the last hour.",
                }
            )
    return alerts
