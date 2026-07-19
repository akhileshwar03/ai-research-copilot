from pydantic import BaseModel


class MessageRequest(BaseModel):
    role: str
    content: str
    # Pre-formatted citation string (e.g. "Report A.pdf, Report B.pdf"), as
    # shown in the UI. Persisted verbatim so citation chips survive reload.
    sources: str | None = None


class SessionData(BaseModel):
    id: int
    title: str
    pinned: bool = False
    messages: list[MessageRequest]
    # Document (stored_filename) ids this session's chat retrieval is scoped
    # to. Empty/omitted means "search all of the user's documents."
    document_ids: list[str] = []


class SessionRequest(BaseModel):
    session: SessionData


# ── Responses ──────────────────────────────────────────────────────────────────

class SessionSummary(BaseModel):
    id: int
    title: str | None = None
    pinned: bool = False
    created_at: str | None = None
    messages: list[MessageRequest] = []
    document_ids: list[str] = []


class SessionListResponse(BaseModel):
    sessions: list[SessionSummary]
    total: int
    skip: int
    limit: int
    # Free-tier retention window in days; 0 means chats are kept forever.
    retention_days: int = 0


class SessionCreateResponse(BaseModel):
    id: int


class SessionMessageResponse(BaseModel):
    message: str
