from sqlalchemy import func
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
            .order_by(Document.pinned.desc(), Document.created_at.desc())
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

    def get_by_filename_and_user(self, original_filename: str, user_email: str) -> Document | None:
        """Case-insensitive lookup by display name, scoped to one user.

        Used to reject a second, differently-content upload under a name
        already in use — without this, "notes.pdf" (content A) and a later,
        unrelated "notes.pdf" / "Notes.pdf" (content B) both land in the
        sidebar with the exact same label and no way to tell them apart.
        Identical-content re-uploads never reach this check at all — they're
        already caught earlier by the checksum dedup, which is friendlier
        (silently reuses the existing document instead of erroring).
        """
        return (
            self.db.query(Document)
            .filter(
                func.lower(Document.original_filename) == original_filename.lower(),
                Document.user_email == user_email,
            )
            .first()
        )

    def update_status(
        self,
        document: Document,
        upload_status: str,
        error_message: str | None = None,
        page_count: int | None = None,
        vision_truncated: bool | None = None,
    ) -> None:
        document.upload_status = upload_status
        document.error_message = error_message
        if page_count is not None:
            document.page_count = page_count
        if vision_truncated is not None:
            document.vision_truncated = vision_truncated
        self.db.flush()

    def set_pinned(self, document: Document, pinned: bool) -> None:
        document.pinned = pinned
        self.db.flush()

    def delete(self, document: Document) -> None:
        self.db.delete(document)
        self.db.flush()
