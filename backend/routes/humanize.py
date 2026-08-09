import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_humanizer_service
from app.core.rate_limit import limiter
from app.schemas.humanize import HumanizeRequest
from app.services.humanizer_service import HumanizerService
from app.services.runtime_settings import humanize_rate_limit

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/humanize")
@limiter.limit(humanize_rate_limit)
async def humanize_text(
    request: Request,
    body: HumanizeRequest,
    email: str = Depends(get_current_user_email),
    service: HumanizerService = Depends(get_humanizer_service),
):
    # Runs before the StreamingResponse is constructed, so a validation
    # failure returns a normal 400/413 JSON error rather than an SSE frame
    # after the response has already committed to 200.
    stripped = service.validate(body.text)

    async def event_stream():
        try:
            async for event in service.stream(stripped, style=body.style, expand=body.expand):
                if event["type"] == "revised":
                    yield f"event: revised\ndata: {json.dumps(event['text'])}\n\n"
                else:
                    yield f"data: {json.dumps(event['text'])}\n\n"
        except Exception:
            logger.exception("humanize_stream_error")
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
