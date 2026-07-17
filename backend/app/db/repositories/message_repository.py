from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db.models.chat_models import ChatMessage


class MessageRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_many(self, session_id: int, messages: list[dict]) -> None:
        self.db.add_all(
            ChatMessage(role=m["role"], content=m["content"], session_id=session_id)
            for m in messages
        )

    def delete_by_session_id(self, session_id: int) -> None:
        # Single bulk DELETE — avoids fetching rows into Python memory and
        # issuing one DELETE per row (which is O(N) round trips).
        self.db.execute(
            delete(ChatMessage).where(ChatMessage.session_id == session_id)
        )
