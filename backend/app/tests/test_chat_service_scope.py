"""ChatService's document-scope behaviour:
- no document_ids  -> retrieval is skipped entirely, general prompt used
- document_ids set -> retrieval is scoped + a ground-truth "available
  documents" line (using display names, not raw stored_filenames) is
  always present, independent of what retrieval matched
"""
import asyncio

from app.services.chat_service import ChatService, GENERAL_SYSTEM_PROMPT


def _run(agen):
    """Drain an async generator synchronously — avoids depending on the
    pytest-asyncio plugin (listed in requirements.txt but not installed in
    this venv) just for two tests."""
    async def collect():
        return [item async for item in agen]

    return asyncio.run(collect())


class RecordingRetrievalService:
    def __init__(self):
        self.called = False
        self.last_kwargs = None

    def retrieve_context(self, query, source_ids=None, n_results=None, user_email="", source_names=None):
        self.called = True
        self.last_kwargs = {"source_ids": source_ids, "user_email": user_email, "source_names": source_names}
        return {"context": "", "sources": []}


class RecordingAIService:
    def __init__(self):
        self.last_messages = None

    async def stream_chat(self, messages):
        self.last_messages = messages
        yield "ok"


def test_no_documents_skips_retrieval_and_uses_general_prompt():
    retrieval = RecordingRetrievalService()
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    events = _run(service.stream_response(messages=[{"role": "user", "content": "hi"}], document_ids=None))

    assert retrieval.called is False
    assert events[0] == {"type": "sources", "sources": []}
    system_prompt = ai.last_messages[0][1]
    assert system_prompt == GENERAL_SYSTEM_PROMPT
    assert "document" not in system_prompt.lower() or "no documents are selected" in system_prompt.lower()


def test_documents_selected_scopes_retrieval_and_names_are_resolved():
    retrieval = RecordingRetrievalService()
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    events = _run(
        service.stream_response(
            messages=[{"role": "user", "content": "compare them"}],
            document_ids=["uuid-a.pdf", "uuid-b.pdf"],
            document_names={"uuid-a.pdf": "Report A.pdf", "uuid-b.pdf": "Report B.pdf"},
            user_email="a@example.com",
        )
    )

    assert retrieval.called is True
    assert retrieval.last_kwargs["source_ids"] == ["uuid-a.pdf", "uuid-b.pdf"]
    assert retrieval.last_kwargs["source_names"] == {"uuid-a.pdf": "Report A.pdf", "uuid-b.pdf": "Report B.pdf"}

    system_prompt = ai.last_messages[0][1]
    assert "Documents available in this conversation: Report A.pdf, Report B.pdf" in system_prompt
    # The raw stored-filename ids must never leak into the prompt the model sees.
    assert "uuid-a.pdf" not in system_prompt
    assert "uuid-b.pdf" not in system_prompt
