"""Admin analytics: daily series, per-tool aggregates, engagement, and activity patterns.

Everything here is UTC. Day bucketing and range bounds are explicit (timestamps are
converted to UTC on PostgreSQL rather than trusting the connection's session
timezone), and counts/averages are exact SQL aggregates; only latency percentiles
are computed from a bounded sample of the most recent events.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import case, extract, func
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.db.models.chat_models import ChatMessage, ChatSession
from app.db.models.document import Document
from app.db.models.humanizer_run import HumanizerRun
from app.db.models.realtime_models import RealtimeSession
from app.db.models.usage_event import UsageEvent
from app.db.models.user import User
from app.services.usage_tracking import TOOL_LABELS

MAX_RANGE_DAYS = 366
ENGAGEMENT_WINDOW_DAYS = 30
TOOL_DURATION_SAMPLE = 5000
OVERALL_DURATION_SAMPLE = 20000


def _utc(db: Session, column):
    return func.timezone("UTC", column) if db.get_bind().dialect.name == "postgresql" else column


def _day_key(value) -> str:
    return value.isoformat() if isinstance(value, (date, datetime)) else str(value)[:10]


def day_bounds(start: date, days: int) -> tuple[datetime, datetime]:
    since = datetime(start.year, start.month, start.day, tzinfo=timezone.utc)
    return since, since + timedelta(days=days)


def _percentile(values: list[int], pct: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(pct * (len(ordered) - 1))))
    return int(ordered[index])


def _daily_counts(db: Session, column, since: datetime, until: datetime, *filters) -> dict[str, int]:
    bucket = func.date(_utc(db, column))
    rows = (
        db.query(bucket, func.count())
        .filter(column >= since, column < until, *filters)
        .group_by(bucket)
        .all()
    )
    return {_day_key(day): int(n) for day, n in rows}


def _daily_messages(db: Session, since: datetime, until: datetime, user_id: int | None) -> dict[str, int]:
    bucket = func.date(_utc(db, ChatMessage.created_at))
    query = db.query(bucket, func.count(ChatMessage.id)).filter(
        ChatMessage.created_at >= since, ChatMessage.created_at < until
    )
    if user_id is not None:
        query = query.join(ChatSession, ChatSession.id == ChatMessage.session_id).filter(ChatSession.user_id == user_id)
    return {_day_key(day): int(n) for day, n in query.group_by(bucket).all()}


def _event_filters(since: datetime, until: datetime, user_id: int | None) -> list:
    filters = [UsageEvent.created_at >= since, UsageEvent.created_at < until]
    if user_id is not None:
        filters.append(UsageEvent.user_id == user_id)
    return filters


def _daily_active_users(db: Session, since: datetime, until: datetime, user_id: int | None) -> dict[str, int]:
    bucket = func.date(_utc(db, UsageEvent.created_at))
    rows = (
        db.query(bucket, func.count(func.distinct(UsageEvent.user_id)))
        .filter(*_event_filters(since, until, user_id), UsageEvent.user_id.isnot(None))
        .group_by(bucket)
        .all()
    )
    return {_day_key(day): int(n) for day, n in rows}


def _distinct_active_users(db: Session, since: datetime, until: datetime, user_id: int | None) -> int:
    return int(
        db.query(func.count(func.distinct(UsageEvent.user_id)))
        .filter(*_event_filters(since, until, user_id), UsageEvent.user_id.isnot(None))
        .scalar()
        or 0
    )


def _engagement(db: Session, end: date, user_id: int | None) -> dict:
    """DAU/WAU/MAU for the windows ending on `end` (inclusive).

    Stickiness is the standard definition: average daily active users over the
    trailing 30 days divided by the distinct users active in those 30 days.
    """
    since, until = day_bounds(end - timedelta(days=ENGAGEMENT_WINDOW_DAYS - 1), ENGAGEMENT_WINDOW_DAYS)
    daily = _daily_active_users(db, since, until, user_id)
    mau = _distinct_active_users(db, since, until, user_id)
    week_since, _ = day_bounds(end - timedelta(days=6), 7)
    avg_dau = sum(daily.values()) / ENGAGEMENT_WINDOW_DAYS
    return {
        "window_days": ENGAGEMENT_WINDOW_DAYS,
        "dau": daily.get(end.isoformat(), 0),
        "wau": _distinct_active_users(db, week_since, until, user_id),
        "mau": mau,
        "active_days": sum(1 for n in daily.values() if n > 0),
        "avg_dau": round(avg_dau, 1),
        "stickiness_pct": round(avg_dau / mau * 100, 1) if mau else 0.0,
    }


def _hourly_activity(db: Session, since: datetime, until: datetime, user_id: int | None) -> list[dict]:
    """Requests and errors bucketed by UTC weekday (Mon=0) and hour, non-empty cells only."""
    column = _utc(db, UsageEvent.created_at)
    dow = extract("dow", column)
    hour = extract("hour", column)
    query = (
        db.query(
            dow,
            hour,
            func.count(UsageEvent.id),
            func.sum(case((UsageEvent.ok.is_(False), 1), else_=0)),
        )
        .filter(*_event_filters(since, until, user_id))
        .group_by(dow, hour)
    )
    cells = [
        {"weekday": (int(d) + 6) % 7, "hour": int(h), "requests": int(n), "errors": int(e or 0)}
        for d, h, n, e in query.all()
    ]
    return sorted(cells, key=lambda c: (c["weekday"], c["hour"]))


def _tool_stats(db: Session, filters: list) -> list[dict]:
    rows = (
        db.query(
            UsageEvent.tool,
            func.count(UsageEvent.id),
            func.sum(case((UsageEvent.ok.is_(False), 1), else_=0)),
            func.avg(UsageEvent.duration_ms),
            func.count(func.distinct(UsageEvent.user_id)),
        )
        .filter(*filters)
        .group_by(UsageEvent.tool)
        .all()
    )
    tools = []
    for tool, requests, errors, avg_ms, users in sorted(rows, key=lambda r: -r[1]):
        durations = [
            int(d or 0)
            for (d,) in db.query(UsageEvent.duration_ms)
            .filter(*filters, UsageEvent.tool == tool)
            .order_by(UsageEvent.created_at.desc())
            .limit(TOOL_DURATION_SAMPLE)
        ]
        errors = int(errors or 0)
        tools.append(
            {
                "tool": tool,
                "label": TOOL_LABELS.get(tool, tool),
                "requests": int(requests),
                "errors": errors,
                "error_rate": round(errors / requests, 4) if requests else 0.0,
                "avg_ms": int(avg_ms or 0),
                "p95_ms": _percentile(durations, 0.95),
                "users": int(users),
            }
        )
    return tools


def _top_users(db: Session, filters: list) -> list[dict]:
    rows = (
        db.query(UsageEvent.user_id, func.count(UsageEvent.id))
        .filter(*filters, UsageEvent.user_id.isnot(None))
        .group_by(UsageEvent.user_id)
        .order_by(func.count(UsageEvent.id).desc(), UsageEvent.user_id)
        .limit(10)
        .all()
    )
    emails = dict(db.query(User.id, User.email).filter(User.id.in_([uid for uid, _ in rows])).all()) if rows else {}
    return [{"user_id": uid, "email": emails.get(uid, "(deleted)"), "requests": int(n)} for uid, n in rows]


def _overall_latency(db: Session, filters: list) -> dict:
    avg_ms = db.query(func.avg(UsageEvent.duration_ms)).filter(*filters).scalar()
    durations = [
        int(d or 0)
        for (d,) in db.query(UsageEvent.duration_ms)
        .filter(*filters)
        .order_by(UsageEvent.created_at.desc())
        .limit(OVERALL_DURATION_SAMPLE)
    ]
    return {"avg_ms": int(avg_ms or 0), "p95_ms": _percentile(durations, 0.95)}


MB = 1024 * 1024


def size_class_filter(size: str):
    """SQL clause for a document size class (small < 1 MB, medium 1-10 MB inclusive, large > 10 MB), or None for all."""
    column = func.coalesce(Document.size_bytes, 0)
    if size == "small":
        return column < MB
    if size == "medium":
        return (column >= MB) & (column <= 10 * MB)
    if size == "large":
        return column > 10 * MB
    return None


def document_summary(db: Session, user_email: str | None = None) -> dict:
    """Whole-inventory snapshot of stored documents (optionally one owner's): totals, status, size classes."""
    query = db.query(Document)
    if user_email is not None:
        query = query.filter(Document.user_email == user_email)
    size = func.coalesce(Document.size_bytes, 0)
    count, total_bytes, small, medium, large = query.with_entities(
        func.count(Document.id),
        func.coalesce(func.sum(size), 0),
        func.coalesce(func.sum(case((size < MB, 1), else_=0)), 0),
        func.coalesce(func.sum(case(((size >= MB) & (size <= 10 * MB), 1), else_=0)), 0),
        func.coalesce(func.sum(case((size > 10 * MB, 1), else_=0)), 0),
    ).one()
    by_status = {
        status: int(n)
        for status, n in query.with_entities(Document.upload_status, func.count(Document.id))
        .group_by(Document.upload_status)
        .all()
    }
    return {
        "count": int(count),
        "bytes": int(total_bytes),
        "by_status": by_status,
        "by_size": {"small": int(small), "medium": int(medium), "large": int(large)},
    }


def compute_analytics(db: Session, start: date, end: date, user_id: int | None, user_email: str | None) -> dict:
    """Series and aggregates for the inclusive UTC day range [start, end], optionally for one user."""
    days = (end - start).days + 1
    since, until = day_bounds(start, days)

    def scoped(column, *extra):
        return [*extra, column == user_id] if user_id is not None else list(extra)

    signups = _daily_counts(db, User.created_at, since, until, *scoped(User.id))
    documents = _daily_counts(
        db, Document.created_at, since, until, *([Document.user_email == user_email] if user_id is not None else [])
    )
    sessions = _daily_counts(db, ChatSession.created_at, since, until, *scoped(ChatSession.user_id))
    humanizer_runs = _daily_counts(db, HumanizerRun.created_at, since, until, *scoped(HumanizerRun.user_id))
    realtime_sessions = _daily_counts(db, RealtimeSession.created_at, since, until, *scoped(RealtimeSession.user_id))
    requests = _daily_counts(db, UsageEvent.created_at, since, until, *scoped(UsageEvent.user_id))
    errors = _daily_counts(db, UsageEvent.created_at, since, until, *scoped(UsageEvent.user_id, UsageEvent.ok.is_(False)))
    messages = _daily_messages(db, since, until, user_id)
    active = _daily_active_users(db, since, until, user_id)

    series = []
    for offset in range(days):
        day = (start + timedelta(days=offset)).isoformat()
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
                "active_users": active.get(day, 0),
            }
        )

    filters = _event_filters(since, until, user_id)

    return {
        "days": days,
        "since": start.isoformat(),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "user_id": user_id,
        "series": series,
        "hourly": _hourly_activity(db, since, until, user_id),
        "tools": _tool_stats(db, filters),
        "top_users": _top_users(db, filters),
        "latency": _overall_latency(db, filters),
        "active_users": _distinct_active_users(db, since, until, user_id),
        "engagement": _engagement(db, end, user_id),
    }


def resolve_range(days: int, start: date | None, end: date | None, today: date) -> tuple[date, date]:
    """The inclusive UTC range for a request: [start, end] if given (missing end = today,
    missing start = end - days + 1), otherwise the last `days` days."""
    range_end = end or today
    range_start = start or (range_end - timedelta(days=days - 1))
    if range_start > range_end:
        raise AppError(code="INVALID_RANGE", message="start must be on or before end.", status_code=400)
    if (range_end - range_start).days + 1 > MAX_RANGE_DAYS:
        raise AppError(
            code="RANGE_TOO_LARGE", message=f"Date range cannot exceed {MAX_RANGE_DAYS} days.", status_code=400
        )
    return range_start, range_end


def previous_range(start: date, end: date) -> tuple[date, date]:
    span = (end - start).days + 1
    previous_end = start - timedelta(days=1)
    return previous_end - timedelta(days=span - 1), previous_end


def resolve_user(db: Session, user_id: int | None) -> str | None:
    if user_id is None:
        return None
    email = db.query(User.email).filter(User.id == user_id).scalar()
    if email is None:
        raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)
    return email
