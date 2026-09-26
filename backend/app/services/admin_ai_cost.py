"""Estimated AI spend for the admin console, from logged token counts and list prices (see ai_pricing)."""

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models.ai_usage_event import AIUsageEvent
from app.db.models.user import User
from app.services.admin_analytics import _day_key, _utc, day_bounds
from app.services.ai_pricing import PRICING_SOURCE, PRICING_VERIFIED_ON, cost_usd
from app.services.usage_tracking import TOOL_LABELS

TOP_USERS_LIMIT = 20


class _Bucket:
    __slots__ = ("calls", "input_tokens", "output_tokens", "cached_input_tokens", "cost", "unpriced_calls")

    def __init__(self) -> None:
        self.calls = self.input_tokens = self.output_tokens = self.cached_input_tokens = self.unpriced_calls = 0
        self.cost = 0.0

    def add(self, calls: int, inp: int, out: int, cached: int, cost: float | None) -> None:
        self.calls += calls
        self.input_tokens += inp
        self.output_tokens += out
        self.cached_input_tokens += cached
        if cost is None:
            self.unpriced_calls += calls
        else:
            self.cost += cost

    def out(self) -> dict:
        return {
            "calls": self.calls,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cached_input_tokens": self.cached_input_tokens,
            "cost_usd": round(self.cost, 6),
            # Calls whose model has no verified price; their cost is NOT included in cost_usd.
            "unpriced_calls": self.unpriced_calls,
        }


def compute_ai_cost(db: Session, start: date, end: date, user_id: int | None = None) -> dict:
    """Estimated spend for the inclusive UTC range [start, end], optionally for a single user."""
    days = (end - start).days + 1
    since, until = day_bounds(start, days)
    bucket = func.date(_utc(db, AIUsageEvent.created_at))
    query = (
        db.query(
            bucket,
            AIUsageEvent.model,
            AIUsageEvent.kind,
            AIUsageEvent.tool,
            AIUsageEvent.user_id,
            func.count(AIUsageEvent.id),
            func.coalesce(func.sum(AIUsageEvent.input_tokens), 0),
            func.coalesce(func.sum(AIUsageEvent.output_tokens), 0),
            func.coalesce(func.sum(AIUsageEvent.cached_input_tokens), 0),
        )
        .filter(AIUsageEvent.created_at >= since, AIUsageEvent.created_at < until)
        .group_by(bucket, AIUsageEvent.model, AIUsageEvent.kind, AIUsageEvent.tool, AIUsageEvent.user_id)
    )
    if user_id is not None:
        query = query.filter(AIUsageEvent.user_id == user_id)

    total = _Bucket()
    by_model: dict[tuple[str, str], _Bucket] = {}
    by_tool: dict[str | None, _Bucket] = {}
    by_user: dict[int, _Bucket] = {}
    daily: dict[str, _Bucket] = {}
    unpriced: set[str] = set()

    for day, model, kind, tool, uid, calls, inp, out, cached in query.all():
        calls, inp, out, cached = int(calls), int(inp), int(out), int(cached)
        cost = cost_usd(model, inp, out, cached)
        if cost is None:
            unpriced.add(model)
        total.add(calls, inp, out, cached, cost)
        by_model.setdefault((model, kind), _Bucket()).add(calls, inp, out, cached, cost)
        by_tool.setdefault(tool, _Bucket()).add(calls, inp, out, cached, cost)
        daily.setdefault(_day_key(day), _Bucket()).add(calls, inp, out, cached, cost)
        if uid is not None:
            by_user.setdefault(uid, _Bucket()).add(calls, inp, out, cached, cost)

    emails = {}
    if by_user:
        emails = dict(db.query(User.id, User.email).filter(User.id.in_(list(by_user))).all())
    top_users = sorted(by_user.items(), key=lambda kv: kv[1].cost, reverse=True)[:TOP_USERS_LIMIT]

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "user_id": user_id,
        "total": total.out(),
        "by_model": [
            {"model": model, "kind": kind, **b.out()}
            for (model, kind), b in sorted(by_model.items(), key=lambda kv: kv[1].cost, reverse=True)
        ],
        "by_tool": [
            {"tool": tool, "label": TOOL_LABELS.get(tool or "", "Outside a tool request"), **b.out()}
            for tool, b in sorted(by_tool.items(), key=lambda kv: kv[1].cost, reverse=True)
        ],
        "top_users": [{"user_id": uid, "email": emails.get(uid, "(deleted)"), **b.out()} for uid, b in top_users],
        "daily": [{"date": d, **b.out()} for d, b in sorted(daily.items())],
        "unpriced_models": sorted(unpriced),
        "pricing": {"source": PRICING_SOURCE, "verified_on": PRICING_VERIFIED_ON, "note": "List-price estimate; OpenAI's invoice is authoritative."},
    }
