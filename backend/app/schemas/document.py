from pydantic import BaseModel


class DocumentSummary(BaseModel):
    id: str
    name: str
    size_bytes: int
    upload_status: str
    created_at: str | None = None
    pinned: bool = False
    # Real total PDF page count from pypdf, captured during ingestion.
    # None until ingestion completes, or for legacy rows ingested before
    # this field existed.
    page_count: int | None = None
    # True when this document had more vision-candidate (diagram/chart)
    # pages than the per-upload cap allowed captioning — some visuals in it
    # were never indexed, purely because of the cap.
    vision_truncated: bool = False


class DocumentListResponse(BaseModel):
    documents: list[DocumentSummary]
    total: int
    skip: int
    limit: int
    # Free-tier retention window in days; 0 means documents are kept forever.
    retention_days: int = 0


class DocumentStatusResponse(BaseModel):
    document_id: str
    upload_status: str
    error_message: str | None = None


class UploadAcceptedResponse(BaseModel):
    document_id: str
    name: str
    upload_status: str
    size_bytes: int


class DocumentPinRequest(BaseModel):
    pinned: bool


class DocumentPinResponse(BaseModel):
    id: str
    pinned: bool
