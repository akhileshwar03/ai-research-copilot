from fastapi import APIRouter, Depends, File, Request, UploadFile

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_ai_service
from app.core.exceptions import AppError
from app.core.rate_limit import limiter
from app.schemas.extract import ExtractedText, UrlExtractRequest
from app.services.ai_service import AIService
from app.services.content_extraction_service import extract_text_from_image, extract_text_from_url
from app.services.runtime_settings import extract_rate_limit

router = APIRouter(prefix="/extract")

_ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024


@router.post("/url", response_model=ExtractedText)
@limiter.limit(extract_rate_limit)
async def extract_url(
    request: Request,
    body: UrlExtractRequest,
    email: str = Depends(get_current_user_email),
):
    text = await extract_text_from_url(body.url)
    return {"text": text}


@router.post("/image", response_model=ExtractedText)
@limiter.limit(extract_rate_limit)
async def extract_image(
    request: Request,
    file: UploadFile = File(...),
    email: str = Depends(get_current_user_email),
    ai_service: AIService = Depends(get_ai_service),
):
    content_type = file.content_type or ""
    if content_type not in _ALLOWED_IMAGE_TYPES:
        raise AppError(
            code="INVALID_FILE_TYPE", message="Only PNG, JPEG, or WEBP images are allowed", status_code=400
        )

    content = await file.read()
    if len(content) > _MAX_IMAGE_BYTES:
        raise AppError(code="FILE_TOO_LARGE", message="Image exceeds the 10 MB limit", status_code=413)

    text = await extract_text_from_image(content, content_type, ai_service)
    return {"text": text}
