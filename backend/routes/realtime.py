import json
import logging

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_realtime_service, get_realtime_session_service
from app.core.rate_limit import limiter
from app.schemas.realtime import (
    RealtimeChatRequest,
    RealtimeSessionCreateResponse,
    RealtimeSessionListResponse,
    RealtimeSessionMessageResponse,
    RealtimeSessionRequest,
)
from app.services.realtime_service import RealtimeService
from app.services.realtime_session_service import RealtimeSessionService
from app.services.runtime_settings import realtime_rate_limit

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/realtime/chat")
@limiter.limit(realtime_rate_limit)
async def realtime_chat(
    request: Request,
    body: RealtimeChatRequest,
    email: str = Depends(get_current_user_email),
    service: RealtimeService = Depends(get_realtime_service),
):
    async def event_stream():
        try:
            async for event in service.stream_response(
                messages=[message.model_dump() for message in body.messages]
            ):
                if event["type"] == "sources":
                    yield f"event: sources\ndata: {json.dumps(event['sources'])}\n\n"
                else:
                    yield f"data: {json.dumps(event['value'])}\n\n"
        except Exception:
            logger.exception("realtime_stream_error")
            error_payload = json.dumps({"message": "Stream processing failed. Please try again."})
            yield f"event: error\ndata: {error_payload}\n\n"
        finally:
            yield "event: done\ndata: \n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Session persistence ──────────────────────────────────────────────────────
# Independent of /sessions (Research Copilot's) — Real-time AI has its own
# conversation history, not shared with the Copilot product.


@router.get("/realtime/sessions", response_model=RealtimeSessionListResponse)
def get_realtime_sessions(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
    email: str = Depends(get_current_user_email),
    service: RealtimeSessionService = Depends(get_realtime_session_service),
):
    return service.get_sessions(email, skip=skip, limit=limit)


@router.post("/realtime/sessions", response_model=RealtimeSessionCreateResponse)
def create_realtime_session(
    request: RealtimeSessionRequest,
    email: str = Depends(get_current_user_email),
    service: RealtimeSessionService = Depends(get_realtime_session_service),
):
    return service.create_session(
        email=email,
        title=request.session.title,
        messages=[message.model_dump() for message in request.session.messages],
        pinned=request.session.pinned,
    )


@router.put("/realtime/sessions/{session_id}", response_model=RealtimeSessionMessageResponse)
def update_realtime_session(
    session_id: int,
    request: RealtimeSessionRequest,
    email: str = Depends(get_current_user_email),
    service: RealtimeSessionService = Depends(get_realtime_session_service),
):
    return service.update_session(
        session_id=session_id,
        user_email=email,
        title=request.session.title,
        messages=[message.model_dump() for message in request.session.messages],
        pinned=request.session.pinned,
    )


@router.delete("/realtime/sessions/{session_id}", response_model=RealtimeSessionMessageResponse)
def delete_realtime_session(
    session_id: int,
    email: str = Depends(get_current_user_email),
    service: RealtimeSessionService = Depends(get_realtime_session_service),
):
    return service.delete_session(session_id=session_id, user_email=email)
