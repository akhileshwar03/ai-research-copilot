from fastapi import APIRouter, BackgroundTasks, Depends, File, Request, UploadFile

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_document_service
from app.core.rate_limit import limiter
from app.schemas.document import UploadAcceptedResponse
from app.services.document_service import DocumentService
from app.services.runtime_settings import upload_rate_limit

router = APIRouter()


@router.post("/upload", status_code=202, response_model=UploadAcceptedResponse)
@limiter.limit(upload_rate_limit)
async def upload_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    """Accept a PDF, persist it to disk, and schedule background ingestion.

    Returns 202 Accepted immediately so the client is not blocked waiting for
    potentially slow PDF parsing and embedding. Poll GET /documents/{id}/status
    or re-fetch the document list to observe the status transition
    processing → ready (or failed).
    """
    result = await service.initiate_upload(file, user_email=email)
    # Gated on is_new, not upload_status == "processing" — a duplicate
    # upload (same file, same user) landing while the original's background
    # ingestion is still running would also read upload_status ==
    # "processing" on the existing row, and scheduling a second ingestion
    # pass for the same document would duplicate every chunk it produces
    # (including vision-captioned ones, doubling that cost). is_new is only
    # ever True for the call that actually created the row.
    if result.get("is_new"):
        background_tasks.add_task(service.process_upload_background, result["document_id"])
    return result
