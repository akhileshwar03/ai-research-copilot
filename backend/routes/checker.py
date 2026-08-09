import io

from fastapi import APIRouter, Depends, File, Request, UploadFile

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_checker_service, get_writing_feedback_service
from app.core.constants import ALLOWED_UPLOAD_EXTENSIONS
from app.core.exceptions import AppError
from app.core.rate_limit import limiter
from app.schemas.checker import CheckResult, CheckTextRequest
from app.schemas.writing_feedback import WritingFeedbackRequest, WritingFeedbackResult
from app.services.checker_service import CheckerService
from app.services.runtime_settings import checker_rate_limit, feedback_rate_limit, runtime_settings
from app.services.writing_feedback_service import WritingFeedbackService

router = APIRouter(prefix="/checker")


@router.post("/text", response_model=CheckResult)
@limiter.limit(checker_rate_limit)
async def check_text(
    request: Request,
    body: CheckTextRequest,
    email: str = Depends(get_current_user_email),
    service: CheckerService = Depends(get_checker_service),
):
    return await service.check_text(body.text, advanced=body.advanced)


@router.post("/document", response_model=CheckResult)
@limiter.limit(checker_rate_limit)
async def check_document(
    request: Request,
    file: UploadFile = File(...),
    email: str = Depends(get_current_user_email),
    service: CheckerService = Depends(get_checker_service),
):
    import os

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise AppError(code="INVALID_FILE_TYPE", message="Only PDF files are allowed", status_code=400)

    content = await file.read()
    max_upload_mb = int(runtime_settings.get("max_upload_size_mb"))
    if len(content) > max_upload_mb * 1024 * 1024:
        raise AppError(
            code="FILE_TOO_LARGE",
            message=f"File exceeds the {max_upload_mb} MB limit",
            status_code=413,
        )

    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    if not text:
        raise AppError(
            code="NO_TEXT_EXTRACTED",
            message="This document has no extractable text (it may be a scanned image) — OCR isn't supported yet",
            status_code=422,
        )

    return await service.check_text(text)


@router.post("/feedback", response_model=WritingFeedbackResult)
@limiter.limit(feedback_rate_limit)
async def writing_feedback(
    request: Request,
    body: WritingFeedbackRequest,
    email: str = Depends(get_current_user_email),
    service: WritingFeedbackService = Depends(get_writing_feedback_service),
):
    return await service.analyze(body.text)
