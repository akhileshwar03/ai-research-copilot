from fastapi import APIRouter, Depends

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_document_service
from app.services.document_service import DocumentService

router = APIRouter()


@router.get("/documents")
def list_documents(
    email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    return service.list_documents(user_email=email)


@router.delete("/documents/{filename}")
def delete_document(
    filename: str,
    email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    # Verify ownership before deleting
    docs = service.list_documents(user_email=email)
    owned_ids = {d["id"] for d in docs["documents"]}
    if filename not in owned_ids:
        from app.core.exceptions import AppError
        raise AppError(code="FORBIDDEN", message="Document not found", status_code=404)
    return service.delete_document(filename)
