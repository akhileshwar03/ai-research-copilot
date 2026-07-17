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
from app.services.runtime_settings import runtime_settings

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

    async def initiate_upload(self, file: UploadFile, user_email: str | None = None) -> dict:
        """Validate the upload, persist the file to disk, and create the DB record.

        Returns immediately with status='processing'.  The caller is expected to
        schedule process_upload_background() as a BackgroundTask so that heavy
        PDF ingestion does not block the HTTP response.
        """
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ALLOWED_UPLOAD_EXTENSIONS:
            raise AppError(code="INVALID_FILE_TYPE", message="Only PDF files are allowed", status_code=400)

        content = await file.read()
        size_bytes = len(content)
        max_upload_mb = int(runtime_settings.get("max_upload_size_mb"))
        if size_bytes > max_upload_mb * 1024 * 1024:
            raise AppError(
                code="FILE_TOO_LARGE",
                message=f"File exceeds the {max_upload_mb} MB limit",
                status_code=413,
            )

        checksum_sha256 = hashlib.sha256(content).hexdigest()
        existing = self.document_repo.get_by_checksum_and_user(checksum_sha256, user_email or "")
        if existing:
            logger.info(
                "upload_duplicate original=%s stored=%s user=%s",
                file.filename,
                existing.stored_filename,
                user_email,
            )
            return {
                "document_id": existing.stored_filename,
                "name": existing.original_filename,
                "upload_status": existing.upload_status,
                "size_bytes": existing.size_bytes,
            }

        stored_filename = f"{uuid.uuid4()}{ext}"
        filepath = os.path.join(self.settings.uploads_dir, stored_filename)

        with open(filepath, "wb") as output:
            output.write(content)

        document = self.document_repo.create(
            original_filename=file.filename or stored_filename,
            stored_filename=stored_filename,
            content_type=file.content_type or "application/pdf",
            size_bytes=size_bytes,
            checksum_sha256=checksum_sha256,
            upload_status="processing",
            user_email=user_email,
        )
        self.document_repo.db.commit()

        logger.info("upload_accepted stored=%s size_bytes=%s user=%s", stored_filename, size_bytes, user_email)
        return {
            "document_id": stored_filename,
            "name": document.original_filename,
            "upload_status": "processing",
            "size_bytes": size_bytes,
        }

    def process_upload_background(self, stored_filename: str) -> None:
        """Run PDF ingestion in the background after the HTTP response is sent.

        Opens its own DB session so it is fully decoupled from the
        request-scoped session that is already closed by the time this runs.
        """
        from app.db.session import SessionLocal

        db = SessionLocal()
        try:
            repo = DocumentRepository(db)
            doc = repo.get_by_stored_filename(stored_filename)
            if not doc:
                logger.warning("background_ingestion_doc_missing stored=%s", stored_filename)
                return

            filepath = os.path.join(self.settings.uploads_dir, stored_filename)
            if not os.path.exists(filepath):
                repo.update_status(doc, upload_status="failed", error_message="File missing after upload")
                db.commit()
                return

            self.ingestion_service.process_pdf(
                filepath=filepath,
                source_id=stored_filename,
                user_email=doc.user_email or "",
            )
            repo.update_status(doc, upload_status="ready")
            db.commit()
            logger.info("background_ingestion_complete stored=%s", stored_filename)

        except Exception:
            db.rollback()
            try:
                repo = DocumentRepository(db)
                doc = repo.get_by_stored_filename(stored_filename)
                if doc:
                    repo.update_status(doc, upload_status="failed", error_message="Ingestion failed")
                    db.commit()
            except Exception:
                logger.exception("background_ingestion_status_update_failed stored=%s", stored_filename)
            logger.exception("background_ingestion_failed stored=%s", stored_filename)
        finally:
            db.close()

    def get_document_status(self, stored_filename: str, user_email: str) -> dict:
        doc = self.document_repo.get_by_stored_filename(stored_filename)
        if not doc or doc.user_email != user_email:
            raise AppError(code="DOCUMENT_NOT_FOUND", message="Document not found", status_code=404)
        return {
            "document_id": doc.stored_filename,
            "upload_status": doc.upload_status,
            "error_message": doc.error_message,
        }

    def list_documents(self, user_email: str | None = None, skip: int = 0, limit: int = 100) -> dict:
        retention_days = int(runtime_settings.get("retention_days"))
        if not user_email:
            return {"documents": [], "total": 0, "skip": skip, "limit": limit, "retention_days": retention_days}

        documents = self.document_repo.list_by_user(user_email, skip=skip, limit=limit)
        total = self.document_repo.count_by_user(user_email)
        return {
            "retention_days": retention_days,
            "documents": [
                {
                    "id": doc.stored_filename,
                    "name": doc.original_filename,
                    "size_bytes": doc.size_bytes,
                    "upload_status": doc.upload_status,
                    "created_at": doc.created_at.isoformat() if doc.created_at else None,
                }
                for doc in documents
            ],
            "total": total,
            "skip": skip,
            "limit": limit,
        }

    def get_document_filepath(self, stored_filename: str, user_email: str) -> tuple[str, str]:
        """Return (filepath, original_filename) for an owned document, or 404.

        Serving files through this ownership check replaces the old public
        /uploads static mount, which exposed every user's PDF to anyone who
        knew its UUID.
        """
        doc = self.document_repo.get_by_stored_filename(stored_filename)
        if not doc or doc.user_email != user_email:
            raise AppError(code="DOCUMENT_NOT_FOUND", message="Document not found", status_code=404)

        filepath = os.path.join(self.settings.uploads_dir, os.path.basename(doc.stored_filename))
        if not os.path.exists(filepath):
            raise AppError(code="FILE_MISSING", message="Document file is missing", status_code=404)
        return filepath, doc.original_filename

    def delete_document(self, filename: str, user_email: str) -> dict:
        """Delete a document only when it belongs to *user_email*."""
        document = self.document_repo.get_by_stored_filename(filename)
        if not document or document.user_email != user_email:
            raise AppError(code="DOCUMENT_NOT_FOUND", message="Document not found", status_code=404)

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
        logger.info("upload_deleted stored=%s user=%s", filename, user_email)
        return {"message": "Document deleted"}
