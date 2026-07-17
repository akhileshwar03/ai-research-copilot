from pydantic import BaseModel


class MessageRequest(BaseModel):
    role: str
    content: str


class SessionData(BaseModel):
    id: int
    title: str
    pinned: bool = False
    messages: list[MessageRequest]


class SessionRequest(BaseModel):
    session: SessionData


# ── Responses ──────────────────────────────────────────────────────────────────

class SessionSummary(BaseModel):
    id: int
    title: str | None = None
    pinned: bool = False
    created_at: str | None = None
    messages: list[MessageRequest] = []


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
