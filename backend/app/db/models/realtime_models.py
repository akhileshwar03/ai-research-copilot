from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.db.session import Base


class RealtimeSession(Base):
    """A Real-time AI conversation. Deliberately independent of ChatSession
    (chat_models.py) — Real-time AI and Research Copilot are separate
    products that only connect via the marketing page, not shared storage."""

    __tablename__ = "realtime_sessions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, default="New chat")
    pinned = Column(Boolean, default=False, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    messages = relationship("RealtimeMessage", back_populates="session", cascade="all, delete")


class RealtimeMessage(Base):
    __tablename__ = "realtime_messages"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String)
    content = Column(Text)
    session_id = Column(Integer, ForeignKey("realtime_sessions.id"))
    # JSON-encoded list of {title, url} citation objects for assistant replies.
    sources = Column(Text, nullable=True)

    session = relationship("RealtimeSession", back_populates="messages")
