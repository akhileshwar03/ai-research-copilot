from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func

from app.db.session import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, nullable=True, index=True)   # owner — nullable for legacy rows
    original_filename = Column(String, nullable=False)
    stored_filename = Column(String, unique=True, nullable=False, index=True)
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    checksum_sha256 = Column(String, nullable=False, index=True)  # per-user unique enforced in service
    upload_status = Column(String, nullable=False, default="ready")
    error_message = Column(Text, nullable=True)
    # Mirrors ChatSession.pinned — previously this was a client-only Zustand
    # flag with no backend persistence at all, so "Pin to top" silently reset
    # on every reload/relogin even though the UI looked identical to the
    # (real, persisted) session pin. Now genuinely persisted, same as sessions.
    pinned = Column(Boolean, nullable=False, default=False, server_default="false")
    # The PDF's real total page count (pypdf's len(reader.pages)), captured
    # during background ingestion — nullable because it isn't known until
    # ingestion completes (and legacy rows ingested before this field existed
    # never get it backfilled). Lets the chat prompt state a page count with
    # genuine confidence instead of "at least N pages indexed", which is only
    # a lower bound and reads as evasive when it's already exact.
    page_count = Column(Integer, nullable=True)
    # True when this document had more vision-candidate pages (likely
    # diagrams/charts) than vision_ingestion_max_pages allowed captioning —
    # some of its charts were never indexed purely because of that cap, not
    # because they don't exist. Surfaced to the chat prompt so a "nothing
    # found" answer about a late-document chart doesn't read identically to
    # "there's genuinely no chart here" when it might just be past the cap.
    vision_truncated = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
