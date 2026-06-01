import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_chat_service
from app.core.exceptions import AppError
from app.db.repositories.document_repository import DocumentRepository
from app.db.session import get_db
from app.schemas.chat import ChatRequest
from app.services.chat_service import ChatService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/chat")
async def chat(
    request: ChatRequest,
    email: str = Depends(get_current_user_email),
    service: ChatService = Depends(get_chat_service),
    db: Session = Depends(get_db),
):
    # If a specific document was requested, verify it actually belongs to this user.
    # This prevents User A from reading User B's documents by guessing a stored filename.
    if request.document_id:
        doc = DocumentRepository(db).get_by_stored_filename(request.document_id)
        if not doc or doc.user_email != email:
            raise AppError(
                code="DOCUMENT_NOT_FOUND",
                message="Document not found",
                status_code=404,
            )

    async def stream():
        try:
            async for token in service.stream_response(
                messages=[message.model_dump() for message in request.messages],
                document_id=request.document_id,
                user_email=email,
            ):
                yield token
        except Exception:
            logger.exception("stream_error document_id=%s", request.document_id)
            yield "\n\nAn error occurred while processing your request. Please try again."

    return StreamingResponse(stream(), media_type="text/plain", headers={"X-Sources": ""})
