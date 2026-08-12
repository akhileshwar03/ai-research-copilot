import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_humanizer_service, get_humanizer_ultra_service
from app.core.rate_limit import limiter
from app.schemas.humanize import HumanizeRequest
from app.services.humanizer_service import HumanizerService
from app.services.humanizer_ultra_service import HumanizerUltraService
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


@router.post("/humanize/ultra")
@limiter.limit(humanize_rate_limit)
async def humanize_text_ultra(
    request: Request,
    body: HumanizeRequest,
    email: str = Depends(get_current_user_email),
    service: HumanizerService = Depends(get_humanizer_service),
    ultra_service: HumanizerUltraService = Depends(get_humanizer_ultra_service),
):
    """'Ultra Human' — the real Phase 2 fine-tuned LoRA, not GPT. Local-Ollama-only
    right now (no production hosting yet, see humanizer_ultra_service.py); returns
    a clear 503/504 AppError rather than hanging or crashing when unreachable, so
    the frontend can show an honest "unavailable" state instead of a broken one.
    Not streamed — cold starts run long enough (measured up to ~120s) that a
    dedicated waiting UI on the frontend, not token-by-token streaming, is the
    right way to cover the wait.
    """
    stripped = service.validate(body.text)
    text = await ultra_service.generate(stripped, style=body.style, expand=body.expand)
    return {"text": text}
