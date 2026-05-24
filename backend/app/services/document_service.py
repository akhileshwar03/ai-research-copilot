import hashlib
import logging
import os
import uuid
from fastapi import UploadFile

from app.core.config import get_settings
from app.core.constants import ALLOWED_UPLOAD_EXTENSIONS
from app.core.exceptions import AppError
from app.db.repositories.document_repository import DocumentRepository
from app.modules.rag.ingestion_service import IngestionService
from app.modules.rag.vector_store_manager import VectorStoreManager

logger = logging.getLogger(__name__)


class DocumentService:
    def __init__(
        self,
        document_repo: DocumentRepository,
        ingestion_service: IngestionService,
        vector_store: VectorStoreManager,
    ):
        self.document_repo = document_repo
        self.ingestion_service = ingestion_service
        self.vector_store = vector_store
        self.settings = get_settings()

    async def upload(self, file: UploadFile) -> dict:
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ALLOWED_UPLOAD_EXTENSIONS:
            raise AppError(code="INVALID_FILE_TYPE", message="Only PDF files are allowed", status_code=400)

        content = await file.read()
        size_bytes = len(content)
        max_size = self.settings.max_upload_size_mb * 1024 * 1024
        if size_bytes > max_size:
            raise AppError(code="FILE_TOO_LARGE", message="File is too large", status_code=413)

        checksum_sha256 = hashlib.sha256(content).hexdigest()
        existing = self.document_repo.get_by_checksum(checksum_sha256)
        if existing:
            logger.info("upload_duplicate original=%s stored=%s", file.filename, existing.stored_filename)
            return {"message": "PDF uploaded successfully"}

        stored_filename = f"{uuid.uuid4()}{ext}"
        filepath = os.path.join(self.settings.uploads_dir, stored_filename)

        db = self.document_repo.db
        document = self.document_repo.create(
            original_filename=file.filename or stored_filename,
            stored_filename=stored_filename,
            content_type=file.content_type or "application/pdf",
            size_bytes=size_bytes,
            checksum_sha256=checksum_sha256,
            upload_status="processing",
        )

        try:
            with open(filepath, "wb") as output:
                output.write(content)
            self.ingestion_service.process_pdf(filepath=filepath, source_id=stored_filename)
            self.document_repo.update_status(document, upload_status="ready", error_message=None)
            db.commit()
        except Exception as exc:
            db.rollback()
            if os.path.exists(filepath):
                os.remove(filepath)
            logger.exception("upload_failed stored=%s", stored_filename)
            raise AppError(code="UPLOAD_FAILED", message="Failed to process uploaded document", status_code=500) from exc

        logger.info("upload_complete stored=%s size_bytes=%s", stored_filename, size_bytes)
        return {"message": "PDF uploaded successfully"}

    def list_documents(self) -> dict:
        documents = self.document_repo.list_all()
        return {
            "documents": [
                {"id": doc.stored_filename, "name": doc.original_filename}
                for doc in documents
            ]
        }

    def delete_document(self, filename: str) -> dict:
        document = self.document_repo.get_by_stored_filename(filename)
        if not document:
            return {"message": "Document not found"}

        filepath = os.path.join(self.settings.uploads_dir, filename)
        if os.path.exists(filepath):
            os.remove(filepath)

        try:
            self.vector_store.delete_by_source(filename)
        except Exception:
            logger.exception("vector_cleanup_failed source=%s", filename)

        db = self.document_repo.db
        self.document_repo.delete(document)
        db.commit()
        logger.info("upload_deleted stored=%s", filename)
        return {"message": "Document deleted"}
