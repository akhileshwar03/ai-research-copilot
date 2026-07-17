import logging

from app.core.config import get_settings
from app.modules.rag.embedding_service import EmbeddingService
from app.modules.rag.vector_store_manager import VectorStoreManager
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)


class RetrievalService:
    def __init__(self, embedding_service: EmbeddingService, vector_store: VectorStoreManager):
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.settings = get_settings()

    def retrieve_context(
        self,
        query: str,
        source_id: str | None = None,
        n_results: int | None = None,
        user_email: str = "",
    ) -> dict:
        """Retrieve relevant chunks, always scoped to *user_email*.

        Chunks whose cosine distance exceeds RAG_SIMILARITY_THRESHOLD are
        discarded before being passed to the LLM.  This prevents a document
        with no relevant content from injecting garbage context that causes
        confident-sounding hallucinations.
        """
        query_embedding = self.embedding_service.embed_query(query)

        if source_id and user_email:
            where: dict | None = {"$and": [{"user_email": user_email}, {"source": source_id}]}
        elif user_email:
            where = {"user_email": user_email}
        elif source_id:
            where = {"source": source_id}
        else:
            where = None

        top_k = n_results or int(runtime_settings.get("rag_top_k"))
        results = self.vector_store.query(query_embedding=query_embedding, n_results=top_k, where=where)

        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        threshold = float(runtime_settings.get("rag_similarity_threshold"))
        formatted_chunks = []
        included_metadatas = []

        for i, doc in enumerate(documents):
            distance = distances[i] if i < len(distances) else 0.0
            if distance > threshold:
                logger.debug(
                    "chunk_filtered source=%s chunk=%s distance=%.4f threshold=%.4f",
                    metadatas[i].get("source", "?"),
                    metadatas[i].get("chunk", -1),
                    distance,
                    threshold,
                )
                continue
            source = metadatas[i].get("source", "unknown")
            page = metadatas[i].get("page")
            page_label = f" | PAGE: {page}" if page else ""
            formatted_chunks.append(f"[SOURCE: {source}{page_label} | DIST: {distance:.3f}]\n{doc}")
            included_metadatas.append(metadatas[i])

        unique_sources = list({m.get("source", "unknown") for m in included_metadatas})

        if not formatted_chunks:
            logger.info("retrieval_no_relevant_chunks query_len=%d user=%s", len(query), user_email)

        return {"context": "\n\n".join(formatted_chunks), "sources": unique_sources}
