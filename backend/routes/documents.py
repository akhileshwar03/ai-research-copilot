from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_document_service
from app.schemas.document import DocumentListResponse, DocumentStatusResponse
from app.services.document_service import DocumentService

router = APIRouter()


@router.get("/documents/{document_id}/file")
def get_document_file(
    document_id: str,
    email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    """Serve a document's PDF, restricted to its owner.

    Replaces the public /uploads static mount: files are now only reachable
    with a valid access token belonging to the document's owner.
    """
    filepath, original_filename = service.get_document_filepath(document_id, user_email=email)
    return FileResponse(
        filepath,
        media_type="application/pdf",
        filename=original_filename,
        content_disposition_type="inline",
    )


@router.get("/documents", response_model=DocumentListResponse)
def list_documents(
    skip: int = Query(default=0, ge=0, description="Number of records to skip"),
    limit: int = Query(default=100, ge=1, le=500, description="Maximum number of records to return"),
    email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    return service.list_documents(user_email=email, skip=skip, limit=limit)


@router.get("/documents/{document_id}/status", response_model=DocumentStatusResponse)
def get_document_status(
    document_id: str,
    email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    """Poll the ingestion status of a specific document."""
    return service.get_document_status(stored_filename=document_id, user_email=email)


@router.delete("/documents/{filename}")
def delete_document(
    filename: str,
    email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    return service.delete_document(filename=filename, user_email=email)
