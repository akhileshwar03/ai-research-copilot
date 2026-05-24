from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_chat_service
from app.schemas.chat import ChatRequest
from app.services.chat_service import ChatService

router = APIRouter()


@router.post("/chat")
async def chat(
    request: ChatRequest,
    _email: str = Depends(get_current_user_email),
    service: ChatService = Depends(get_chat_service),
):
    async def stream():
        try:
            async for token in service.stream_response(
                messages=[message.model_dump() for message in request.messages],
                document_id=request.document_id,
            ):
                yield token
        except Exception as exc:
            yield f"\n\nError: {str(exc)}"

    return StreamingResponse(stream(), media_type="text/plain", headers={"X-Sources": ""})
