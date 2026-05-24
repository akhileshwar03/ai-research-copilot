from sqlalchemy.orm import Session

from app.db.models.chat_models import ChatMessage


class MessageRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_many(self, session_id: int, messages: list[dict]) -> None:
        for message in messages:
            self.db.add(
                ChatMessage(
                    role=message["role"],
                    content=message["content"],
                    session_id=session_id,
                )
            )

    def delete_by_session_id(self, session_id: int) -> None:
        rows = self.db.query(ChatMessage).filter(ChatMessage.session_id == session_id).all()
        for row in rows:
            self.db.delete(row)
