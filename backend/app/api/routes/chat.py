import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_current_user, get_current_user_email
from app.api.dependencies.tools import require_tool
from app.api.dependencies.services import get_chat_service
from app.core.exceptions import AppError
from app.core.rate_limit import limiter
from app.db.repositories.document_repository import DocumentRepository
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.chat import ChatRequest
from app.services.chat_service import ChatService
from app.services import chat_quota
from app.services.runtime_settings import chat_rate_limit, runtime_settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/chat", dependencies=[require_tool("research_copilot")])
@limiter.limit(chat_rate_limit)
async def chat(
    request: Request,
    body: ChatRequest,
    email: str = Depends(get_current_user_email),
    user: User = Depends(get_current_user),
    service: ChatService = Depends(get_chat_service),
    db: Session = Depends(get_db),
):
    # Resolve each selected document's display name up front — the model
    # only ever sees stored_filename (a UUID) via retrieval metadata, and
    # without this it cites and reasons about that raw UUID instead of a
    # human-readable name. Also carries each document's real page count
    # (from pypdf at ingestion time) when known, so the chat prompt can
    # state it with confidence instead of falling back to a retrieval-based
    # lower-bound guess.
    document_names: dict[str, str] = {}
    document_page_counts: dict[str, int] = {}
    vision_truncated_documents: set[str] = set()
    if body.document_ids:
        doc_repo = DocumentRepository(db)
        for document_id in body.document_ids:
            doc = doc_repo.get_by_stored_filename(document_id)
            if not doc or doc.user_email != email:
                raise AppError(code="DOCUMENT_NOT_FOUND", message="Document not found", status_code=404)
            document_names[document_id] = doc.original_filename
            if doc.page_count is not None:
                document_page_counts[document_id] = doc.page_count
            if doc.vision_truncated:
                vision_truncated_documents.add(document_id)

    # Runs before the StreamingResponse is constructed, so an over-limit
    # message returns a normal 413 JSON error rather than an SSE frame after
    # the response has already committed to 200.
    service.validate_latest_message([message.model_dump() for message in body.messages])
    service.validate_action(body.action, body.document_ids)

    # Whole-document requests (research actions, counting questions) are ~15x a normal question, so each
    # user gets a daily allowance. Checked here, before the stream starts, so the user gets a normal 429
    # with a readable message instead of a failure halfway through a 200 response.
    quota_taken = False
    full_document = await service.decide_full_document([m.model_dump() for m in body.messages], body.action, body.document_ids)
    if full_document:
        limit = int(runtime_settings.get("chat_full_document_daily_limit"))
        allowed, _used = chat_quota.try_consume(db, user.id, chat_quota.FULL_DOCUMENT, limit)
        if not allowed:
            raise AppError(
                code="FULL_DOCUMENT_LIMIT",
                message=(
                    f"You've used your {limit} whole-document analyses for today (summaries, reports, comparisons "
                    "and counting questions). Ask a specific question instead, or try again after midnight UTC."
                ),
                status_code=429,
                details={"limit": limit},
            )
        quota_taken = limit > 0

    async def event_stream():
        answered = False
        try:
            async for event in service.stream_response(
                messages=[message.model_dump() for message in body.messages],
                document_ids=body.document_ids,
                document_names=document_names,
                document_page_counts=document_page_counts,
                vision_truncated_documents=vision_truncated_documents,
                user_email=email,
                action=body.action,
                full_document=full_document,
            ):
                if event["type"] == "sources":
                    yield f"event: sources\ndata: {json.dumps(event['sources'])}\n\n"
                elif event["type"] == "suggestions":
                    yield f"event: suggestions\ndata: {json.dumps(event['suggestions'])}\n\n"
                else:
                    answered = True
                    # JSON-encode each token so newlines inside markdown don't break SSE framing.
                    yield f"data: {json.dumps(event['value'])}\n\n"
        except AppError as exc:
            # A deliberate, user-safe message (e.g. RETRIEVAL_UNAVAILABLE) -- forward it as-is instead of
            # the generic text so the user learns the real reason and knows a retry is worthwhile.
            logger.warning("stream_app_error code=%s document_ids=%s", exc.code, body.document_ids)
            yield f"event: error\ndata: {json.dumps({'message': exc.message})}\n\n"
        except Exception:
            logger.exception("stream_error document_ids=%s", body.document_ids)
            error_payload = json.dumps({"message": "Stream processing failed. Please try again."})
            yield f"event: error\ndata: {error_payload}\n\n"
        finally:
            if quota_taken and not answered:
                # Nothing was returned (our outage, or the client left) -- don't charge the allowance.
                chat_quota.refund(user.id, chat_quota.FULL_DOCUMENT)
            yield "event: done\ndata: \n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
