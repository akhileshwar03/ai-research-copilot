from sqlalchemy.orm import Session

from app.db.models.chat_models import ChatSession


class SessionRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_by_user_id(self, user_id: int, skip: int = 0, limit: int = 200) -> list[ChatSession]:
        return (
            self.db.query(ChatSession)
            .filter(ChatSession.user_id == user_id)
            .order_by(ChatSession.pinned.desc(), ChatSession.id.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def count_by_user_id(self, user_id: int) -> int:
        return self.db.query(ChatSession).filter(ChatSession.user_id == user_id).count()

    def get_by_id(self, session_id: int) -> ChatSession | None:
        return self.db.query(ChatSession).filter(ChatSession.id == session_id).first()

    def get_by_id_and_user(self, session_id: int, user_id: int) -> ChatSession | None:
        """Return the session only when it belongs to the given user — prevents cross-user access."""
        return (
            self.db.query(ChatSession)
            .filter(ChatSession.id == session_id, ChatSession.user_id == user_id)
            .first()
        )

    def create(self, user_id: int, title: str, pinned: bool = False, document_ids_json: str | None = None) -> ChatSession:
        session = ChatSession(user_id=user_id, title=title, pinned=pinned, document_ids=document_ids_json)
        self.db.add(session)
        self.db.flush()
        return session

    def delete(self, session: ChatSession) -> None:
        self.db.delete(session)
