import os

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.tools import require_tool
from app.api.dependencies.services import get_ai_service
from app.core.constants import ALLOWED_UPLOAD_EXTENSIONS
from app.core.exceptions import AppError
from app.core.rate_limit import limiter
from app.core.uploads import read_upload_limited, require_image_matching, require_pdf
from app.schemas.extract import ExtractedText, UrlExtractRequest
from app.services.ai_service import AIService
from app.services.content_extraction_service import extract_text_from_image, extract_text_from_pdf, extract_text_from_url
from app.services.runtime_settings import extract_rate_limit, runtime_settings

router = APIRouter(prefix="/extract")

_ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024


@router.post("/url", response_model=ExtractedText, dependencies=[require_tool("extract")])
@limiter.limit(extract_rate_limit)
async def extract_url(
    request: Request,
    body: UrlExtractRequest,
    email: str = Depends(get_current_user_email),
):
    text = await extract_text_from_url(body.url)
    return {"text": text}


@router.post("/image", response_model=ExtractedText, dependencies=[require_tool("extract")])
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

    content = await read_upload_limited(file, _MAX_IMAGE_BYTES, "Image exceeds the 10 MB limit")
    require_image_matching(content, content_type)

    text = await extract_text_from_image(content, content_type, ai_service)
    return {"text": text}


@router.post("/pdf", response_model=ExtractedText, dependencies=[require_tool("extract")])
@limiter.limit(extract_rate_limit)
async def extract_pdf(
    request: Request,
    file: UploadFile = File(...),
    email: str = Depends(get_current_user_email),
):
    if os.path.splitext(file.filename or "")[1].lower() not in ALLOWED_UPLOAD_EXTENSIONS:
        raise AppError(code="INVALID_FILE_TYPE", message="Only PDF files are allowed", status_code=400)

    max_upload_mb = int(runtime_settings.get("max_upload_size_mb"))
    content = await read_upload_limited(file, max_upload_mb * 1024 * 1024, f"File exceeds the {max_upload_mb} MB limit")
    require_pdf(content)

    # Parsing is synchronous, CPU-bound work: run it off the event loop so a big PDF can't stall other requests.
    text = await run_in_threadpool(extract_text_from_pdf, content)
    return {"text": text}
