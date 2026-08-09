from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func

from app.db.session import Base


class HumanizerRun(Base):
    """A completed Humaniser run, persisted for the history sidebar. Written
    by the client after streaming finishes (mirrors how chat sessions are
    saved via a follow-up call rather than from inside the SSE generator —
    the request-scoped DB session isn't reliably alive once the streaming
    response body starts executing)."""

    __tablename__ = "humanizer_runs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    input_text = Column(Text, nullable=False)
    output_text = Column(Text, nullable=False)
    style = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
