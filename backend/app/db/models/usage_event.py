from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.sql.elements import ColumnElement

from app.db.session import Base


class UsageEvent(Base):
    """One row per tool request (chat, humanizer, checker, ...), recorded by
    the usage-tracking middleware after the response has fully streamed.

    This is the raw material for the admin analytics view: requests per
    tool per day, error rates, latency percentiles, and per-user activity.
    Deliberately lean — no request bodies, no text, nothing sensitive —
    so it can be kept for as long as the analytics are useful."""

    __tablename__ = "usage_events"

    id = Column(Integer, primary_key=True, index=True)
    # Nullable: unauthenticated requests (e.g. a 401) still count as traffic.
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    tool = Column(String, nullable=False, index=True)
    status_code = Column(Integer, nullable=False)
    ok = Column(Boolean, nullable=False, default=True)
    duration_ms = Column(Integer, nullable=False, default=0)
    request_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    @classmethod
    def is_real_error(cls) -> ColumnElement:
        """A filter expression for "this response indicates something actually went wrong on
        our side" -- used for every error-RATE metric and alert (the admin overview's Error
        Rate stat, the Product Utilization Scorecard, per-tool analytics, the alert that fires
        when a tool crosses alert_error_rate_pct, and PDF report exports). Excludes 401:
        an unauthenticated request (an expired or missing token) is a client-side auth state,
        not a defect in the tool it was aimed at, and counting it as one made the error-rate
        alert fire on stale-session noise with zero real service failures behind it -- a real
        incident (2026-09-28): 4 401s from one 7-second browser-testing burst pushed Research
        Copilot's 30-day rate to 10.8%, comfortably over the 5% alert threshold.

        Deliberately narrower than `ok.is_(False)`: a 401 is still recorded with ok=False and
        still shows up in the raw audit log (GET /admin/usage-events?errors_only=true) -- this
        only changes what counts toward an aggregate RATE meant to signal tool health, not
        whether the request is honestly logged as having failed.
        """
        return cls.ok.is_(False) & (cls.status_code != 401)
