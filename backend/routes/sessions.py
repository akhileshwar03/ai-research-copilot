from fastapi import (
    APIRouter,
    Depends,
)

from sqlalchemy.orm import (
    Session,
)

from db.database import (
    SessionLocal,
)

from models.chat_models import (
    ChatSession,
    ChatMessage,
)

from pydantic import (
    BaseModel,
)
from fastapi import HTTPException

router = APIRouter()

def get_db():

    db = SessionLocal()

    try:

        yield db

    finally:

        db.close()

class MessageRequest(
    BaseModel
):

    role: str

    content: str

class SessionRequest(
    BaseModel
):

    title: str

    user_id: int

    messages:list[
        MessageRequest
    ]

@router.get(
    "/sessions/{user_id}"
)
def get_sessions(
    user_id: int,
    db: Session = Depends(
        get_db
    )
):

    sessions = (
        db.query(
            ChatSession
        )
        .filter(
            ChatSession.user_id
            == user_id
        )
        .all()
    )

    result = []

    for session in sessions:

        result.append({

            "id":
                session.id,

            "title":
                session.title,

            "messages": [

                {
                    "role":
                        message.role,

                    "content":
                        message.content,

                }

                for message
                in session.messages

            ],
        })

    return result

@router.post("/sessions")
def create_session(
    request: SessionRequest,
    db: Session = Depends(
        get_db
    )
):

    session = ChatSession(
        title=request.title,
        user_id=request.user_id,
    )

    db.add(session)

    db.commit()

    db.refresh(session)

    for message in request.messages:

        db_message = ChatMessage(
            role=message.role,
            content=message.content,
            session_id=session.id,
        )

        db.add(db_message)

    db.commit()

    return {
        "id": session.id
    }

@router.delete(
    "/sessions/{session_id}"
)
def delete_session(
    session_id: int,
    db: Session = Depends(
        get_db
    )
):

    session = (
        db.query(
            ChatSession
        )
        .filter(
            ChatSession.id
            == session_id
        )
        .first()
    )

    if session:

        db.delete(session)

        db.commit()

    return {
        "message":
        "Deleted"
    }

@router.put(
    "/sessions/{session_id}"
)
def update_session(
    session_id: int,
    request: SessionRequest,
    db: Session = Depends(
        get_db
    )
):

    session = (
        db.query(
            ChatSession
        )
        .filter(
            ChatSession.id
            == session_id
        )
        .first()
    )

    if not session:

        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

    session.title = request.title

    existing_messages = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.session_id
            == session.id
        )
        .all()
    )

    for message in existing_messages:

        db.delete(message)

    db.commit()

    for message in request.messages:

        db_message = ChatMessage(
            role=message.role,
            content=message.content,
            session_id=session.id,
        )

        db.add(db_message)

    db.commit()

    return {
        "message":
        "Updated"
    }