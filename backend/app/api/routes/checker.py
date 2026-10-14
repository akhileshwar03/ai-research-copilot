import io

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.tools import require_tool
from app.api.dependencies.services import get_checker_service, get_writing_feedback_service
from app.core.constants import ALLOWED_UPLOAD_EXTENSIONS
from app.core.exceptions import AppError
from app.core.rate_limit import limiter
from app.core.uploads import read_upload_limited, require_pdf
from app.schemas.checker import CheckResult, CheckTextRequest
from app.schemas.writing_feedback import WritingFeedbackRequest, WritingFeedbackResult
from app.services.checker_service import CheckerService
from app.services.runtime_settings import checker_rate_limit, feedback_rate_limit, runtime_settings
from app.services.writing_feedback_service import WritingFeedbackService

router = APIRouter(prefix="/checker")


def _extract_pdf_text(content: bytes) -> str:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except Exception as exc:  # pypdf raises a wide family (PdfStreamError, KeyError, RecursionError, ...)
        raise AppError(code="UNREADABLE_PDF", message="Could not read this PDF file", status_code=422) from exc



@router.post("/text", response_model=CheckResult, dependencies=[require_tool("checker")])
@limiter.limit(checker_rate_limit)
async def check_text(
    request: Request,
    body: CheckTextRequest,
    email: str = Depends(get_current_user_email),
    service: CheckerService = Depends(get_checker_service),
):
    return await service.check_text(body.text, advanced=body.advanced)


@router.post("/document", response_model=CheckResult, dependencies=[require_tool("checker")])
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

    max_upload_mb = int(runtime_settings.get("max_upload_size_mb"))
    content = await read_upload_limited(file, max_upload_mb * 1024 * 1024, f"File exceeds the {max_upload_mb} MB limit")
    require_pdf(content)

    # Parsing is synchronous, CPU-bound work: run it off the event loop (as paper_analyzer already
    # does) so a big PDF can't stall every other request, and turn a corrupt file into a clean 422
    # instead of an unhandled 500. A file can start with a valid %PDF- header and still be
    # truncated/corrupt (the header check can't see that) - reproduced locally as a 500, and the
    # same crash fired a real Sentry alert on a fake .pdf before the header check existed.
    text = await run_in_threadpool(_extract_pdf_text, content)
    if not text:
        raise AppError(
            code="NO_TEXT_EXTRACTED",
            message="This document has no extractable text (it may be a scanned image) — OCR isn't supported yet",
            status_code=422,
        )

    return await service.check_text(text)


@router.post("/feedback", response_model=WritingFeedbackResult, dependencies=[require_tool("checker")])
@limiter.limit(feedback_rate_limit)
async def writing_feedback(
    request: Request,
    body: WritingFeedbackRequest,
    email: str = Depends(get_current_user_email),
    service: WritingFeedbackService = Depends(get_writing_feedback_service),
):
    return await service.analyze(body.text)
