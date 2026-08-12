import hashlib
import logging
import os
import uuid

from fastapi import UploadFile
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.core.constants import ALLOWED_UPLOAD_EXTENSIONS
from app.core.exceptions import AppError
from app.db.repositories.document_repository import DocumentRepository
from app.modules.rag.ingestion_service import IngestionService
from app.services.runtime_settings import runtime_settings
from app.services.storage_service import StorageService, get_storage_service

logger = logging.getLogger(__name__)


class DocumentService:
    def __init__(
        self,
        document_repo: DocumentRepository,
        ingestion_service: IngestionService,
        vector_store,
        storage: StorageService | None = None,
    ):
        self.document_repo = document_repo
        self.ingestion_service = ingestion_service
        self.vector_store = vector_store
        self.storage = storage or get_storage_service()
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
                # False even when the existing row is itself still
                # "processing" — the caller (routes/upload.py) uses this,
                # not upload_status, to decide whether to schedule
                # background ingestion. Without this distinction, a second
                # upload of the same file landing while the first one's
                # ingestion is still in flight would see upload_status ==
                # "processing" here too, and schedule a *second* full
                # ingestion pass for the same document — duplicating every
                # chunk (including vision-captioned ones, doubling that
                # cost) in the vector store. This was found live: a real
                # 60KB, 40-page test upload, immediately followed by a
                # second upload of identical content, produced two
                # background_ingestion_complete log lines for the same
                # stored_filename and exactly double the expected chunk count.
                "is_new": False,
            }

        stored_filename = f"{uuid.uuid4()}{ext}"
        original_filename = file.filename or stored_filename

        name_collision = self.document_repo.get_by_filename_and_user(original_filename, user_email or "")
        if name_collision:
            # Different content (checksum already didn't match above) under
            # a name already in use — reject rather than silently creating a
            # second document indistinguishable from the first in the
            # sidebar. A same-name re-upload of a genuinely updated file
            # should be an explicit delete-then-upload, not an implicit one.
            raise AppError(
                code="DUPLICATE_NAME",
                message=f'A document named "{original_filename}" already exists. Rename the file or delete the existing one first.',
                status_code=409,
            )

        self.storage.save(stored_filename, content)

        # Both dedup checks above (checksum and name) are check-then-insert,
        # not atomic — a genuinely concurrent second request could pass both
        # checks before this one commits. The real backstop is the database:
        # uq_documents_user_checksum and uq_documents_user_name (migration
        # 20260812_0017) both exist specifically to catch that race, so this
        # commit is wrapped rather than left to surface as a raw 500.
        try:
            document = self.document_repo.create(
                original_filename=original_filename,
                stored_filename=stored_filename,
                content_type=file.content_type or "application/pdf",
                size_bytes=size_bytes,
                checksum_sha256=checksum_sha256,
                upload_status="processing",
                user_email=user_email,
            )
            self.document_repo.db.commit()
        except IntegrityError:
            self.document_repo.db.rollback()
            self.storage.delete(stored_filename)  # don't leave an orphaned file with no DB row
            logger.warning(
                "upload_race_detected original=%s user=%s — resolving via post-commit lookup",
                file.filename,
                user_email,
            )
            # Whichever constraint we actually lost to, resolve it the same
            # way we would have if our own pre-check had caught it.
            existing = self.document_repo.get_by_checksum_and_user(checksum_sha256, user_email or "")
            if existing:
                return {
                    "document_id": existing.stored_filename,
                    "name": existing.original_filename,
                    "upload_status": existing.upload_status,
                    "size_bytes": existing.size_bytes,
                    "is_new": False,
                }
            raise AppError(
                code="DUPLICATE_NAME",
                message=f'A document named "{original_filename}" already exists. Rename the file or delete the existing one first.',
                status_code=409,
            )

        logger.info("upload_accepted stored=%s size_bytes=%s user=%s", stored_filename, size_bytes, user_email)
        return {
            "document_id": stored_filename,
            "name": document.original_filename,
            "upload_status": "processing",
            "size_bytes": size_bytes,
            "is_new": True,
        }

    async def process_upload_background(self, stored_filename: str) -> None:
        """Run PDF ingestion in the background after the HTTP response is sent.

        Opens its own DB session so it is fully decoupled from the
        request-scoped session that is already closed by the time this runs.
        Async because ingestion may now make vision API calls for pages that
        look like they contain a diagram/chart (see IngestionService) —
        FastAPI's BackgroundTasks runs async callables natively, no route
        changes needed to support this.
        """
        from app.db.session import SessionLocal

        db = SessionLocal()
        try:
            repo = DocumentRepository(db)
            doc = repo.get_by_stored_filename(stored_filename)
            if not doc:
                logger.warning("background_ingestion_doc_missing stored=%s", stored_filename)
                return

            if not self.storage.exists(stored_filename):
                repo.update_status(doc, upload_status="failed", error_message="File missing after upload")
                db.commit()
                return

            content = self.storage.read(stored_filename)
            result = await self.ingestion_service.process_pdf(
                content=content,
                source_id=stored_filename,
                user_email=doc.user_email or "",
            )
            # "empty" (not "ready") when ingestion ran to completion without
            # erroring but produced zero searchable chunks — a scanned/
            # blank PDF with no text layer and vision unavailable or unable
            # to find anything. Previously this looked identical to a
            # normal, healthy document in the sidebar; every future chat
            # question against it would just quietly return "no relevant
            # content," forever, with nothing anywhere explaining why.
            upload_status = "ready" if result.chunks_stored > 0 else "empty"
            repo.update_status(
                doc,
                upload_status=upload_status,
                page_count=result.total_pages,
                vision_truncated=result.vision_truncated,
            )
            db.commit()
            logger.info(
                "background_ingestion_complete stored=%s status=%s chunks=%d vision_pages=%d "
                "vision_truncated=%s",
                stored_filename,
                upload_status,
                result.chunks_stored,
                result.vision_pages_captioned,
                result.vision_truncated,
            )

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
                    "pinned": bool(doc.pinned),
                    "page_count": doc.page_count,
                    "vision_truncated": bool(doc.vision_truncated),
                }
                for doc in documents
            ],
            "total": total,
            "skip": skip,
            "limit": limit,
        }

    def set_pinned(self, filename: str, user_email: str, pinned: bool) -> dict:
        """Toggle a document's pin, only when it belongs to *user_email*.

        Mirrors SessionService's ownership pattern — a document's pin state
        is now genuinely persisted server-side (see the migration adding
        Document.pinned), not a client-only flag that reset on reload.
        """
        document = self.document_repo.get_by_stored_filename(filename)
        if not document or document.user_email != user_email:
            raise AppError(code="DOCUMENT_NOT_FOUND", message="Document not found", status_code=404)

        self.document_repo.set_pinned(document, pinned)
        self.document_repo.db.commit()
        logger.info("document_pin_updated stored=%s user=%s pinned=%s", filename, user_email, pinned)
        return {"id": document.stored_filename, "pinned": pinned}

    def get_document_download(self, stored_filename: str, user_email: str) -> dict:
        """Return download info for an owned document, or 404.

        Serving files through this ownership check replaces the old public
        /uploads static mount, which exposed every user's PDF to anyone who
        knew its UUID.

        Always proxies bytes through the backend now, even on R2 — this used
        to redirect the browser straight to a presigned R2 URL to save
        backend bandwidth, but the frontend consumes this endpoint via
        `fetch().blob()` (for react-pdf), which requires the *final* response
        to carry CORS headers when it's cross-origin. The R2 bucket has no
        CORS policy configured, so that redirect silently broke PDF viewing
        end-to-end ("Unable to load PDF") — a bucket CORS policy is
        infrastructure this service has no way to fix itself. Proxying bytes
        keeps every response same-origin from the browser's point of view,
        so it works regardless of the bucket's CORS configuration.
        """
        doc = self.document_repo.get_by_stored_filename(stored_filename)
        if not doc or doc.user_email != user_email:
            raise AppError(code="DOCUMENT_NOT_FOUND", message="Document not found", status_code=404)

        if not self.storage.exists(doc.stored_filename):
            raise AppError(code="FILE_MISSING", message="Document file is missing", status_code=404)

        return {"mode": "bytes", "content": self.storage.read(doc.stored_filename), "filename": doc.original_filename}

    def delete_document(self, filename: str, user_email: str) -> dict:
        """Delete a document only when it belongs to *user_email*."""
        document = self.document_repo.get_by_stored_filename(filename)
        if not document or document.user_email != user_email:
            raise AppError(code="DOCUMENT_NOT_FOUND", message="Document not found", status_code=404)

        self.storage.delete(filename)

        try:
            self.vector_store.delete_by_source(filename)
        except Exception:
            logger.exception("vector_cleanup_failed source=%s", filename)

        db = self.document_repo.db
        self.document_repo.delete(document)
        db.commit()
        logger.info("upload_deleted stored=%s user=%s", filename, user_email)
        return {"message": "Document deleted"}
