from datetime import datetime
from pydantic import BaseModel


class DocumentItem(BaseModel):
    original_filename: str
    stored_filename: str
    content_type: str
    size_bytes: int
    created_at: datetime


class DocumentListResponse(BaseModel):
    documents: list[str]
