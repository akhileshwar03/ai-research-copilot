from sqlalchemy.orm import Session

from app.db.models.document import Document


class DocumentRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        original_filename: str,
        stored_filename: str,
        content_type: str,
        size_bytes: int,
        checksum_sha256: str,
        upload_status: str = "ready",
        error_message: str | None = None,
        user_email: str | None = None,
    ) -> Document:
        document = Document(
            user_email=user_email,
            original_filename=original_filename,
            stored_filename=stored_filename,
            content_type=content_type,
            size_bytes=size_bytes,
            checksum_sha256=checksum_sha256,
            upload_status=upload_status,
            error_message=error_message,
        )
        self.db.add(document)
        self.db.flush()
        return document

    def list_by_user(self, user_email: str, skip: int = 0, limit: int = 100) -> list[Document]:
        return (
            self.db.query(Document)
            .filter(Document.user_email == user_email)
            .order_by(Document.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def count_by_user(self, user_email: str) -> int:
        return (
            self.db.query(Document)
            .filter(Document.user_email == user_email)
            .count()
        )

    def get_by_stored_filename(self, stored_filename: str) -> Document | None:
        return self.db.query(Document).filter(Document.stored_filename == stored_filename).first()

    def get_by_checksum_and_user(self, checksum_sha256: str, user_email: str) -> Document | None:
        return (
            self.db.query(Document)
            .filter(Document.checksum_sha256 == checksum_sha256, Document.user_email == user_email)
            .first()
        )

    # Kept for test compatibility
    def get_by_checksum(self, checksum_sha256: str) -> Document | None:
        return self.db.query(Document).filter(Document.checksum_sha256 == checksum_sha256).first()

    def update_status(self, document: Document, upload_status: str, error_message: str | None = None) -> None:
        document.upload_status = upload_status
        document.error_message = error_message
        self.db.flush()

    def delete(self, document: Document) -> None:
        self.db.delete(document)
        self.db.flush()
