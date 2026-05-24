from langchain_openai import OpenAIEmbeddings

from app.core.config import get_settings


class EmbeddingService:
    def __init__(self):
        settings = get_settings()
        self.embeddings = OpenAIEmbeddings(api_key=settings.openai_api_key)

    def embed_documents(self, chunks: list[str]) -> list[list[float]]:
        return self.embeddings.embed_documents(chunks)

    def embed_query(self, query: str) -> list[float]:
        return self.embeddings.embed_query(query)
