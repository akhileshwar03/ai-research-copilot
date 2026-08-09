from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db.models.realtime_models import RealtimeMessage, RealtimeSession


class RealtimeSessionRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_by_user_id(self, user_id: int, skip: int = 0, limit: int = 200) -> list[RealtimeSession]:
        return (
            self.db.query(RealtimeSession)
            .filter(RealtimeSession.user_id == user_id)
            .order_by(RealtimeSession.pinned.desc(), RealtimeSession.id.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def count_by_user_id(self, user_id: int) -> int:
        return self.db.query(RealtimeSession).filter(RealtimeSession.user_id == user_id).count()

    def get_by_id_and_user(self, session_id: int, user_id: int) -> RealtimeSession | None:
        return (
            self.db.query(RealtimeSession)
            .filter(RealtimeSession.id == session_id, RealtimeSession.user_id == user_id)
            .first()
        )

    def create(self, user_id: int, title: str, pinned: bool = False) -> RealtimeSession:
        session = RealtimeSession(user_id=user_id, title=title, pinned=pinned)
        self.db.add(session)
        self.db.flush()
        return session

    def delete(self, session: RealtimeSession) -> None:
        self.db.delete(session)


class RealtimeMessageRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_many(self, session_id: int, messages: list[dict]) -> None:
        self.db.add_all(
            RealtimeMessage(role=m["role"], content=m["content"], session_id=session_id, sources=m.get("sources"))
            for m in messages
        )

    def delete_by_session_id(self, session_id: int) -> None:
        self.db.execute(delete(RealtimeMessage).where(RealtimeMessage.session_id == session_id))
