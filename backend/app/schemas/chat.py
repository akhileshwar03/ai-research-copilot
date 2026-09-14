from typing import Literal

from pydantic import BaseModel

ResearchAction = Literal["summarize", "key_findings", "report", "compare", "references", "questions"]


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    # Document (stored_filename) ids to scope retrieval to. Empty/omitted
    # means "search all of the user's documents."
    document_ids: list[str] | None = None
    # A structured research action (summary, report, ...). When set, the
    # whole selected document set is used as context instead of top-k
    # retrieval, and the action's instruction replaces the latest user
    # message for the model. Requires at least one selected document.
    action: ResearchAction | None = None
