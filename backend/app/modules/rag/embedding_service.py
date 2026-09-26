from langchain_openai import OpenAIEmbeddings

from app.core.config import get_settings
from app.services.ai_usage import _MeteredEmbeddingsClient


class EmbeddingService:
    def __init__(self):
        settings = get_settings()
        self.embeddings = OpenAIEmbeddings(api_key=settings.openai_api_key)
        # Record the provider-reported token count of every embedding request (see ai_usage.py).
        self.embeddings.client = _MeteredEmbeddingsClient(self.embeddings.client, self.embeddings.model)

    def embed_documents(self, chunks: list[str]) -> list[list[float]]:
        return self.embeddings.embed_documents(chunks)

    def embed_query(self, query: str) -> list[float]:
        return self.embeddings.embed_query(query)
