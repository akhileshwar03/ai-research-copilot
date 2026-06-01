from fastapi import APIRouter, Depends

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_session_service
from app.schemas.session import SessionRequest
from app.services.session_service import SessionService

router = APIRouter()


@router.get("/sessions")
def get_sessions(
    email: str = Depends(get_current_user_email),
    service: SessionService = Depends(get_session_service),
):
    return service.get_sessions(email)


@router.post("/sessions")
def create_session(
    request: SessionRequest,
    email: str = Depends(get_current_user_email),
    service: SessionService = Depends(get_session_service),
):
    return service.create_session(
        email=email,
        title=request.session.title,
        messages=[message.model_dump() for message in request.session.messages],
        pinned=request.session.pinned,
    )


@router.put("/sessions/{session_id}")
def update_session(
    session_id: int,
    request: SessionRequest,
    email: str = Depends(get_current_user_email),
    service: SessionService = Depends(get_session_service),
):
    return service.update_session(
        session_id=session_id,
        user_email=email,
        title=request.session.title,
        messages=[message.model_dump() for message in request.session.messages],
        pinned=request.session.pinned,
    )


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    email: str = Depends(get_current_user_email),
    service: SessionService = Depends(get_session_service),
):
    return service.delete_session(session_id=session_id, user_email=email)
