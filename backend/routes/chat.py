import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_chat_service
from app.core.exceptions import AppError
from app.core.rate_limit import limiter
from app.db.repositories.document_repository import DocumentRepository
from app.db.session import get_db
from app.schemas.chat import ChatRequest
from app.services.chat_service import ChatService
from app.services.runtime_settings import chat_rate_limit

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/chat")
@limiter.limit(chat_rate_limit)
async def chat(
    request: Request,
    body: ChatRequest,
    email: str = Depends(get_current_user_email),
    service: ChatService = Depends(get_chat_service),
    db: Session = Depends(get_db),
):
    # Resolve each selected document's display name up front — the model
    # only ever sees stored_filename (a UUID) via retrieval metadata, and
    # without this it cites and reasons about that raw UUID instead of a
    # human-readable name.
    document_names: dict[str, str] = {}
    if body.document_ids:
        doc_repo = DocumentRepository(db)
        for document_id in body.document_ids:
            doc = doc_repo.get_by_stored_filename(document_id)
            if not doc or doc.user_email != email:
                raise AppError(code="DOCUMENT_NOT_FOUND", message="Document not found", status_code=404)
            document_names[document_id] = doc.original_filename

    async def event_stream():
        try:
            async for event in service.stream_response(
                messages=[message.model_dump() for message in body.messages],
                document_ids=body.document_ids,
                document_names=document_names,
                user_email=email,
            ):
                if event["type"] == "sources":
                    yield f"event: sources\ndata: {json.dumps(event['sources'])}\n\n"
                else:
                    # JSON-encode each token so newlines inside markdown don't break SSE framing.
                    yield f"data: {json.dumps(event['value'])}\n\n"
        except Exception:
            logger.exception("stream_error document_ids=%s", body.document_ids)
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
