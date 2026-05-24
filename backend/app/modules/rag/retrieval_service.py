from app.core.config import get_settings
from app.modules.rag.embedding_service import EmbeddingService
from app.modules.rag.vector_store_manager import VectorStoreManager


class RetrievalService:
    def __init__(self, embedding_service: EmbeddingService, vector_store: VectorStoreManager):
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.settings = get_settings()

    def retrieve_context(self, query: str, source_id: str | None = None, n_results: int | None = None) -> dict:
        query_embedding = self.embedding_service.embed_query(query)
        where = {"source": source_id} if source_id else None
        top_k = n_results or self.settings.rag_top_k
        results = self.vector_store.query(query_embedding=query_embedding, n_results=top_k, where=where)

        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]

        formatted_chunks = []
        for i, doc in enumerate(documents):
            source = metadatas[i].get("source", "unknown")
            chunk_number = metadatas[i].get("chunk", -1)
            formatted_chunks.append(f"[SOURCE: {source} | CHUNK: {chunk_number}]\n{doc}")

        unique_sources = list({metadata.get("source", "unknown") for metadata in metadatas})

        return {"context": "\n\n".join(formatted_chunks), "sources": unique_sources}
