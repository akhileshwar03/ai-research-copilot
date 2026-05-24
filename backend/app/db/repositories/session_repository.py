from sqlalchemy.orm import Session

from app.db.models.chat_models import ChatSession


class SessionRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_by_user_id(self, user_id: int) -> list[ChatSession]:
        return (
            self.db.query(ChatSession)
            .filter(ChatSession.user_id == user_id)
            .order_by(ChatSession.pinned.desc(), ChatSession.id.desc())
            .all()
        )

    def get_by_id(self, session_id: int) -> ChatSession | None:
        return self.db.query(ChatSession).filter(ChatSession.id == session_id).first()

    def create(self, user_id: int, title: str, pinned: bool = False) -> ChatSession:
        session = ChatSession(user_id=user_id, title=title, pinned=pinned)
        self.db.add(session)
        self.db.flush()
        return session

    def delete(self, session: ChatSession) -> None:
        self.db.delete(session)
