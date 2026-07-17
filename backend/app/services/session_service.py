import logging

from app.core.exceptions import AppError
from app.db.repositories.message_repository import MessageRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.user_repository import UserRepository
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)


class SessionService:
    def __init__(self, session_repo: SessionRepository, message_repo: MessageRepository, user_repo: UserRepository):
        self.session_repo = session_repo
        self.message_repo = message_repo
        self.user_repo = user_repo

    def get_sessions(self, email: str, skip: int = 0, limit: int = 200) -> dict:
        retention_days = int(runtime_settings.get("retention_days"))
        user = self.user_repo.get_by_email(email)
        if not user:
            return {"sessions": [], "total": 0, "skip": skip, "limit": limit, "retention_days": retention_days}

        sessions = self.session_repo.list_by_user_id(user.id, skip=skip, limit=limit)
        total = self.session_repo.count_by_user_id(user.id)
        return {
            "retention_days": retention_days,
            "sessions": [
                {
                    "id": session.id,
                    "title": session.title,
                    "pinned": session.pinned,
                    "created_at": session.created_at.isoformat() if session.created_at else None,
                    "messages": [{"role": m.role, "content": m.content} for m in session.messages],
                }
                for session in sessions
            ],
            "total": total,
            "skip": skip,
            "limit": limit,
        }

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

    def _resolve_user_id(self, email: str) -> int:
        user = self.user_repo.get_by_email(email)
        if not user:
            raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)
        return user.id

    def _get_owned_session(self, session_id: int, user_id: int):
        session = self.session_repo.get_by_id_and_user(session_id, user_id)
        if not session:
            raise AppError(code="SESSION_NOT_FOUND", message="Session not found", status_code=404)
        return session

    def update_session(self, session_id: int, user_email: str, title: str, messages: list[dict], pinned: bool = False) -> dict:
        user_id = self._resolve_user_id(user_email)
        session = self._get_owned_session(session_id, user_id)

        db = self.session_repo.db
        session.title = title
        session.pinned = pinned
        self.message_repo.delete_by_session_id(session_id=session.id)
        self.message_repo.create_many(session_id=session.id, messages=messages)
        db.commit()
        logger.info("session_updated email=%s session_id=%s pinned=%s", user_email, session.id, pinned)
        return {"message": "Updated"}

    def delete_session(self, session_id: int, user_email: str) -> dict:
        user_id = self._resolve_user_id(user_email)
        session = self._get_owned_session(session_id, user_id)

        db = self.session_repo.db
        self.session_repo.delete(session)
        db.commit()
        logger.info("session_deleted email=%s session_id=%s", user_email, session_id)
        return {"message": "Deleted"}
