from fastapi import APIRouter, Depends, Query

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_session_service
from app.schemas.session import (
    SessionCreateResponse,
    SessionListResponse,
    SessionMessageResponse,
    SessionRequest,
)
from app.services.session_service import SessionService

router = APIRouter()


@router.get("/sessions", response_model=SessionListResponse)
def get_sessions(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
    email: str = Depends(get_current_user_email),
    service: SessionService = Depends(get_session_service),
):
    return service.get_sessions(email, skip=skip, limit=limit)


@router.post("/sessions", response_model=SessionCreateResponse)
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
        document_ids=request.session.document_ids,
    )


@router.put("/sessions/{session_id}", response_model=SessionMessageResponse)
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
        document_ids=request.session.document_ids,
    )


@router.delete("/sessions/{session_id}", response_model=SessionMessageResponse)
def delete_session(
    session_id: int,
    email: str = Depends(get_current_user_email),
    service: SessionService = Depends(get_session_service),
):
    return service.delete_session(session_id=session_id, user_email=email)
