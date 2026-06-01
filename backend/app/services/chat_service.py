import logging

from app.modules.rag.retrieval_service import RetrievalService
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are Querex, an intelligent AI research assistant.
Use retrieved document context when available.
If the answer exists in the document context, prioritize it.
Do not hallucinate missing facts.
If information is unavailable, say clearly that the document does not contain the answer.
Answer clearly and accurately.
"""


class ChatService:
    def __init__(self, retrieval_service: RetrievalService, ai_service: AIService):
        self.retrieval_service = retrieval_service
        self.ai_service = ai_service

    async def stream_response(
        self,
        messages: list[dict],
        document_id: str | None = None,
        user_email: str = "",
    ):
        latest_user_message = ""
        for msg in reversed(messages):
            if msg["role"] == "user":
                latest_user_message = msg["content"]
                break

        # Retrieval is always scoped to user_email so no cross-user leakage occurs
        retrieval = self.retrieval_service.retrieve_context(
            latest_user_message,
            source_id=document_id,
            user_email=user_email,
        )
        context = retrieval["context"]

        formatted_messages = [("system", f"{SYSTEM_PROMPT}\n\nDOCUMENT CONTEXT:\n{context}")]
        formatted_messages.extend([(msg["role"], msg["content"]) for msg in messages])

        logger.info("chat_stream_start document_id=%s context_sources=%s", document_id, retrieval.get("sources", []))
        async for token in self.ai_service.stream_chat(formatted_messages):
            yield token
