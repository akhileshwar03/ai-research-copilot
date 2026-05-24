from fastapi import APIRouter, Depends, File, UploadFile

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_document_service
from app.services.document_service import DocumentService

router = APIRouter()


@router.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    _email: str = Depends(get_current_user_email),
    service: DocumentService = Depends(get_document_service),
):
    return await service.upload(file)
