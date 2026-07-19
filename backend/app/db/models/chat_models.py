from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.db.session import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, default="New Chat")
    pinned = Column(Boolean, default=False, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # JSON-encoded list of document stored_filenames this session's chat
    # retrieval is scoped to. Empty/null means "search all of the user's
    # documents" (the pre-existing default behaviour).
    document_ids = Column(Text, nullable=True)

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String)
    content = Column(Text)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"))
    # Pre-formatted citation string for assistant replies (e.g. "Report A.pdf,
    # Report B.pdf"), exactly as shown in the UI. Without this column, sources
    # only ever lived in-memory on the client and vanished on any reload.
    sources = Column(Text, nullable=True)

    session = relationship("ChatSession", back_populates="messages")
