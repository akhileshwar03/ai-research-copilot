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
