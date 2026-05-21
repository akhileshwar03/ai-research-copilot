from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    Text,
)

from sqlalchemy.orm import (
    relationship,
)

from db.database import Base

class ChatSession(Base):

    __tablename__ = "chat_sessions"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    title = Column(
        String,
        default="New Chat"
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id")
    )

    messages = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete"
    )

class ChatMessage(Base):

    __tablename__ = "chat_messages"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    role = Column(
        String
    )

    content = Column(
        Text
    )

    session_id = Column(
        Integer,
        ForeignKey(
            "chat_sessions.id"
        )
    )

    session = relationship(
        "ChatSession",
        back_populates="messages"
    )