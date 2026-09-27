from langchain_openai import OpenAIEmbeddings

from app.core.config import get_settings
from app.services.ai_usage import _MeteredEmbeddingsClient
from app.services.runtime_settings import runtime_settings


class EmbeddingService:
    """Wraps OpenAI embeddings, reading the model from the admin-adjustable ``rag_embedding_model``
    runtime setting on every call rather than fixing it at construction time.

    A client is built once per model name and cached (switching back and forth costs nothing extra).
    IMPORTANT: switching the setting does NOT re-embed chunks already stored under a different model --
    see scripts/reembed_chunks.py and the setting's own description. New ingestion and every query always
    use whatever model is configured *right now*, so a stale mix of vectors from two models in the same
    table would silently produce meaningless similarity scores until the migration is run.
    """

    def __init__(self):
        self._settings = get_settings()
        self._clients: dict[str, OpenAIEmbeddings] = {}

    def _client(self) -> OpenAIEmbeddings:
        model = str(runtime_settings.get("rag_embedding_model"))
        client = self._clients.get(model)
        if client is None:
            client = OpenAIEmbeddings(model=model, api_key=self._settings.openai_api_key)
            # Record the provider-reported token count of every embedding request (see ai_usage.py).
            client.client = _MeteredEmbeddingsClient(client.client, client.model)
            self._clients[model] = client
        return client

    def embed_documents(self, chunks: list[str]) -> list[list[float]]:
        return self._client().embed_documents(chunks)

    def embed_query(self, query: str) -> list[float]:
        return self._client().embed_query(query)
