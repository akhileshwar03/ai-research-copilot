from pydantic import BaseModel


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    # Document (stored_filename) ids to scope retrieval to. Empty/omitted
    # means "search all of the user's documents."
    document_ids: list[str] | None = None
