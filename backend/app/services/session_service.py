import logging

from app.core.exceptions import AppError
from app.db.repositories.message_repository import MessageRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


class SessionService:
    def __init__(self, session_repo: SessionRepository, message_repo: MessageRepository, user_repo: UserRepository):
        self.session_repo = session_repo
        self.message_repo = message_repo
        self.user_repo = user_repo

    def get_sessions(self, email: str) -> list[dict]:
        user = self.user_repo.get_by_email(email)
        if not user:
            return []

        sessions = self.session_repo.list_by_user_id(user.id)
        return [
            {
                "id": session.id,
                "title": session.title,
                "pinned": session.pinned,
                "messages": [{"role": m.role, "content": m.content} for m in session.messages],
            }
            for session in sessions
        ]

    def create_session(self, email: str, title: str, messages: list[dict], pinned: bool = False) -> dict:
        user = self.user_repo.get_by_email(email)
        if not user:
            raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)

        db = self.session_repo.db
        session = self.session_repo.create(user_id=user.id, title=title, pinned=pinned)
        self.message_repo.create_many(session_id=session.id, messages=messages)
        db.commit()
        db.refresh(session)
        logger.info("session_created email=%s session_id=%s", email, session.id)
        return {"id": session.id}

    def update_session(self, session_id: int, title: str, messages: list[dict], pinned: bool = False) -> dict:
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise AppError(code="SESSION_NOT_FOUND", message="Session not found", status_code=404)

        db = self.session_repo.db
        session.title = title
        session.pinned = pinned
        self.message_repo.delete_by_session_id(session_id=session.id)
        self.message_repo.create_many(session_id=session.id, messages=messages)
        db.commit()
        logger.info("session_updated session_id=%s pinned=%s", session.id, pinned)
        return {"message": "Updated"}

    def delete_session(self, session_id: int) -> dict:
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise AppError(code="SESSION_NOT_FOUND", message="Session not found", status_code=404)

        db = self.session_repo.db
        self.session_repo.delete(session)
        db.commit()
        logger.info("session_deleted session_id=%s", session_id)
        return {"message": "Deleted"}
