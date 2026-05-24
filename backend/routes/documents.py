from fastapi import APIRouter, Depends

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_document_service
from app.services.document_service import DocumentService

router = APIRouter()


@router.get("/documents")
def list_documents(
    _email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    return service.list_documents()


@router.delete("/documents/{filename}")
def delete_document(
    filename: str,
    _email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    return service.delete_document(filename)
