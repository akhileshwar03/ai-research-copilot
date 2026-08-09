import os

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_paper_analyzer_service
from app.core.constants import ALLOWED_UPLOAD_EXTENSIONS
from app.core.exceptions import AppError
from app.core.rate_limit import limiter
from app.schemas.paper_analyzer import PaperAnalysisResult
from app.services.paper_analyzer_service import PaperAnalyzerService
from app.services.runtime_settings import paper_analyzer_rate_limit, runtime_settings

router = APIRouter(prefix="/paper-analyzer")


@router.post("/analyze", response_model=PaperAnalysisResult)
@limiter.limit(paper_analyzer_rate_limit)
async def analyze(
    request: Request,
    file: UploadFile = File(...),
    style: str = Form(...),
    email: str = Depends(get_current_user_email),
    service: PaperAnalyzerService = Depends(get_paper_analyzer_service),
):
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

    # Layout measurement is synchronous, CPU-bound work (pdfplumber has no
    # async API) — run it off the event loop so it doesn't block other
    # requests, unlike the LLM-backed services which just await network calls.
    return await run_in_threadpool(service.analyze, content, style)
