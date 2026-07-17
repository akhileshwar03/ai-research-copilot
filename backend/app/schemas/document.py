from pydantic import BaseModel


class DocumentSummary(BaseModel):
    id: str
    name: str
    size_bytes: int
    upload_status: str
    created_at: str | None = None


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
