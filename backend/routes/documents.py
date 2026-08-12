from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_document_service
from app.core.rate_limit import limiter
from app.schemas.document import (
    DocumentListResponse,
    DocumentPinRequest,
    DocumentPinResponse,
    DocumentStatusResponse,
)
from app.services.document_service import DocumentService
from app.services.runtime_settings import documents_rate_limit

router = APIRouter()


@router.get("/documents/{document_id}/file")
@limiter.limit(documents_rate_limit)
def get_document_file(
    request: Request,
    document_id: str,
    email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    """Serve a document's PDF, restricted to its owner.

    Replaces the public /uploads static mount: files are now only reachable
    with a valid access token belonging to the document's owner. Always
    proxies bytes through the backend (see get_document_download's docstring
    for why the old R2-presigned-redirect was dropped — it broke PDF viewing
    entirely due to the bucket having no CORS policy).
    """
    download = service.get_document_download(document_id, user_email=email)
    return Response(
        content=download["content"],
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{download["filename"]}"'},
    )


@router.get("/documents", response_model=DocumentListResponse)
@limiter.limit(documents_rate_limit)
def list_documents(
    request: Request,
    skip: int = Query(default=0, ge=0, description="Number of records to skip"),
    limit: int = Query(default=100, ge=1, le=500, description="Maximum number of records to return"),
    email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    return service.list_documents(user_email=email, skip=skip, limit=limit)


@router.get("/documents/{document_id}/status", response_model=DocumentStatusResponse)
@limiter.limit(documents_rate_limit)
def get_document_status(
    request: Request,
    document_id: str,
    email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    """Poll the ingestion status of a specific document."""
    return service.get_document_status(stored_filename=document_id, user_email=email)


@router.patch("/documents/{document_id}/pin", response_model=DocumentPinResponse)
@limiter.limit(documents_rate_limit)
def set_document_pinned(
    request: Request,
    document_id: str,
    body: DocumentPinRequest,
    email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    """Pin/unpin a document. Genuinely persisted server-side (see the
    documents.pinned migration) — previously this was a client-only flag
    that silently reset on every reload."""
    return service.set_pinned(filename=document_id, user_email=email, pinned=body.pinned)


@router.delete("/documents/{filename}")
@limiter.limit(documents_rate_limit)
def delete_document(
    request: Request,
    filename: str,
    email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    return service.delete_document(filename=filename, user_email=email)
