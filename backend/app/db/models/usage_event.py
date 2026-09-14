from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func

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
