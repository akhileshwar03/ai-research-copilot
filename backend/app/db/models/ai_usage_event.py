from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from app.db.session import Base


class AIUsageEvent(Base):
    """One row per model call, with the token counts the provider reported.

    Raw counts only -- no prices. Cost is computed at read time from a pricing table, so a price change
    (or a correction) never requires rewriting history. No prompt or response text is stored.
    """

    __tablename__ = "ai_usage_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    # The tool the request belonged to (see usage_tracking.TOOL_ROUTES); NULL for calls outside a tool request.
    tool = Column(String, nullable=True, index=True)
    request_id = Column(String, nullable=True)
    # "chat" (LLM completion) or "embedding".
    kind = Column(String, nullable=False, default="chat")
    model = Column(String, nullable=False)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    # Portion of input_tokens the provider billed at the cached-input rate (0 when unreported).
    cached_input_tokens = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
