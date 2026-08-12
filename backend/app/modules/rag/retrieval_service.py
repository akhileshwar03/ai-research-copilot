import logging

from app.core.config import get_settings
from app.modules.rag.embedding_service import EmbeddingService
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)


class RetrievalService:
    def __init__(self, embedding_service: EmbeddingService, vector_store):
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.settings = get_settings()

    def retrieve_context(
        self,
        query: str,
        source_ids: list[str] | None = None,
        n_results: int | None = None,
        user_email: str = "",
        source_names: dict[str, str] | None = None,
    ) -> dict:
        """Retrieve relevant chunks, always scoped to *user_email*.

        *source_ids* narrows retrieval to one or more specific documents
        (multi-document compare); omitted/empty searches all of the user's
        documents. Chunks whose cosine distance exceeds
        RAG_SIMILARITY_THRESHOLD are discarded before being passed to the
        LLM. This prevents a document with no relevant content from
        injecting garbage context that causes confident-sounding
        hallucinations.

        *source_names* maps stored_filename -> display name, used to label
        chunks in the context block with a human-readable name instead of
        the raw stored UUID (which the model would otherwise parrot back
        verbatim when citing sources in its reply).
        """
        source_names = source_names or {}
        query_embedding = self.embedding_service.embed_query(query)

        source_filter: dict | None = {"source": {"$in": source_ids}} if source_ids else None

        if source_filter and user_email:
            where: dict | None = {"$and": [{"user_email": user_email}, source_filter]}
        elif user_email:
            where = {"user_email": user_email}
        elif source_filter:
            where = source_filter
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
            display_name = source_names.get(source, source)
            page = metadatas[i].get("page")
            page_label = f" | PAGE: {page}" if page else ""
            formatted_chunks.append(f"[SOURCE: {display_name}{page_label} | DIST: {distance:.3f}]\n{doc}")
            included_metadatas.append(metadatas[i])

        unique_sources = list({m.get("source", "unknown") for m in included_metadatas})

        if not formatted_chunks:
            logger.info("retrieval_no_relevant_chunks query_len=%d user=%s", len(query), user_email)

        return {"context": "\n\n".join(formatted_chunks), "sources": unique_sources}

    def get_max_indexed_pages(self, source_ids: list[str], user_email: str = "") -> dict[str, int]:
        """Highest page number actually ingested per document — a real,
        queryable fact (see PgVectorStore.max_pages), not a retrieval-based
        guess. Lets the chat prompt answer "how many pages" honestly instead
        of extrapolating from whatever chunks a similarity search surfaced."""
        return self.vector_store.max_pages(source_ids, user_email=user_email)

    def get_full_document_context(
        self,
        source_ids: list[str],
        user_email: str = "",
        source_names: dict[str, str] | None = None,
        max_chars: int | None = None,
    ) -> dict:
        """Every ingested chunk for the given documents, concatenated in
        original document order — not a top-k similarity search.

        For "how many / list all / total" questions, top-k retrieval
        structurally cannot answer correctly: it returns a handful of chunks
        ranked by similarity to the *query wording*, not the chunks needed
        to actually count or enumerate something across the whole document.
        This trades that off against context size — capped at *max_chars*
        (default rag_full_document_max_chars) so a very large document
        doesn't blow the model's context window or the request's latency/
        cost; when the cap is hit, ``truncated=True`` tells the caller (and
        should tell the model) that a count from this context is a reliable
        lower bound, not a guaranteed exact total.
        """
        source_names = source_names or {}
        cap = max_chars if max_chars is not None else int(runtime_settings.get("rag_full_document_max_chars"))

        chunks = self.vector_store.get_all_chunks(source_ids, user_email=user_email)

        parts: list[str] = []
        total_chars = 0
        truncated = False
        for c in chunks:
            display_name = source_names.get(c["source"], c["source"])
            page_label = f" | PAGE: {c['page']}" if c.get("page") else ""
            piece = f"[SOURCE: {display_name}{page_label}]\n{c['content']}"
            if total_chars + len(piece) > cap:
                truncated = True
                break
            parts.append(piece)
            total_chars += len(piece)

        return {"context": "\n\n".join(parts), "truncated": truncated, "chunk_count": len(parts)}

    def get_page_context(
        self,
        source_ids: list[str],
        pages: list[int],
        user_email: str = "",
        source_names: dict[str, str] | None = None,
    ) -> dict:
        """Every chunk whose stored page metadata is exactly one of *pages*
        — an exact structural filter (see PgVectorStore.get_chunks_by_pages),
        not a similarity search. For "what's on page N" questions (including
        multi-page ones, e.g. "compare page 3 and page 8"), this is the only
        retrieval mode that can actually guarantee the returned content is
        really from those pages.

        Reports which of the requested pages actually had content
        (``found_pages``) and which didn't (``missing_pages``) — a
        multi-page question must never silently answer from only the pages
        that happened to have content while staying quiet about the rest.
        """
        source_names = source_names or {}
        chunks = self.vector_store.get_chunks_by_pages(source_ids, pages, user_email=user_email)

        parts = [
            f"[SOURCE: {source_names.get(c['source'], c['source'])} | PAGE: {c['page']}]\n{c['content']}"
            for c in chunks
        ]
        found_pages = sorted({c["page"] for c in chunks})
        missing_pages = [p for p in pages if p not in found_pages]
        return {
            "context": "\n\n".join(parts),
            "chunk_count": len(parts),
            "found_pages": found_pages,
            "missing_pages": missing_pages,
        }
