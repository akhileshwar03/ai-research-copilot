from langchain_openai import OpenAIEmbeddings

from app.core.config import get_settings
from app.services.ai_usage import _MeteredEmbeddingsClient

# The one embedding model Research Copilot uses -- ingestion and every query, no runtime toggle. A live
# switch (even a single-choice one) is exactly the footgun that caused a real incident on 2026-09-27:
# flipping it without re-embedding existing chunks first made stored vectors and query vectors come from
# two different, incompatible embedding spaces. Changing this now means: run scripts/reembed_chunks.py
# against the database first, THEN edit this constant and redeploy -- a deliberate code change, not
# something an admin can toggle by accident.
EMBEDDING_MODEL = "text-embedding-3-small"


class EmbeddingService:
    """Wraps OpenAI embeddings for the one fixed EMBEDDING_MODEL above."""

    def __init__(self):
        settings = get_settings()
        self._client = OpenAIEmbeddings(model=EMBEDDING_MODEL, api_key=settings.openai_api_key)
        # Record the provider-reported token count of every embedding request (see ai_usage.py).
        self._client.client = _MeteredEmbeddingsClient(self._client.client, self._client.model)

    def embed_documents(self, chunks: list[str]) -> list[list[float]]:
        return self._client.embed_documents(chunks)

    def embed_query(self, query: str) -> list[float]:
        return self._client.embed_query(query)
