from pydantic import BaseModel

from app.schemas.chat import Message


class RealtimeChatRequest(BaseModel):
    messages: list[Message]


# ── Session persistence ──────────────────────────────────────────────────────
# Independent of chat/session.py's schemas — Real-time AI's sessions are a
# separate product, not a variant of Research Copilot's.


class RealtimeSource(BaseModel):
    title: str
    url: str


class RealtimeMessageRequest(BaseModel):
    role: str
    content: str
    sources: list[RealtimeSource] | None = None


class RealtimeSessionData(BaseModel):
    id: int
    title: str
    pinned: bool = False
    messages: list[RealtimeMessageRequest]


class RealtimeSessionRequest(BaseModel):
    session: RealtimeSessionData


class RealtimeSessionSummary(BaseModel):
    id: int
    title: str | None = None
    pinned: bool = False
    created_at: str | None = None
    messages: list[RealtimeMessageRequest] = []


class RealtimeSessionListResponse(BaseModel):
    sessions: list[RealtimeSessionSummary]
    total: int
    skip: int
    limit: int
    retention_days: int = 0


class RealtimeSessionCreateResponse(BaseModel):
    id: int


class RealtimeSessionMessageResponse(BaseModel):
    message: str
