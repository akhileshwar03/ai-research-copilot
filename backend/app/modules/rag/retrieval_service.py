import json
import logging

from app.core.config import get_settings
from app.modules.rag.embedding_service import EmbeddingService
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)

# Measured on a 152-question / 7-document benchmark (2026-09-27): reranking a
# pool of candidates down to the final top-k, on top of title/section-stamped chunks, was the single largest
# additional lever found -- +8 to +10 points of retrieval hit rate for about $0.0003-0.0005 per query.
RERANK_PROMPT = (
    "You are given a question and a numbered list of passages retrieved from the user's document(s). Pick "
    "the passages most likely to contain the answer, best first. Return ONLY JSON: "
    '{"ranked": [passage numbers, best first]}'
)
_RERANK_PASSAGE_CHARS = 900


class RetrievalService:
    def __init__(self, embedding_service: EmbeddingService, vector_store, ai_service=None):
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        # Optional, like IngestionService's: reranking is an enhancement, not a hard requirement. Callers
        # that omit it (or set rag_rerank_enabled off) get plain distance-ranked retrieval, exactly as before
        # this feature existed.
        self.ai_service = ai_service
        self.settings = get_settings()

    async def retrieve_context(
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

        When reranking is enabled (see RERANK_PROMPT above), a larger pool of candidates is fetched and an
        LLM re-scores them against *query*, so the final *n_results* is picked by relevance to the actual
        question rather than by embedding distance alone. *n_results* still controls how many chunks reach
        the model and therefore its cost -- only the candidate pool searched to fill those slots grows.

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
        rerank_on = self.ai_service is not None and bool(runtime_settings.get("rag_rerank_enabled"))
        pool_size = max(top_k, int(runtime_settings.get("rag_rerank_pool_size"))) if rerank_on else top_k
        results = self.vector_store.query(query_embedding=query_embedding, n_results=pool_size, where=where)

        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        threshold = float(runtime_settings.get("rag_similarity_threshold"))
        candidates = []
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
            candidates.append({"doc": doc, "meta": metadatas[i], "distance": distance})

        selected = await self._rerank(query, candidates, top_k) if rerank_on and len(candidates) > top_k else candidates[:top_k]

        formatted_chunks = []
        included_metadatas = []
        for c in selected:
            source = c["meta"].get("source", "unknown")
            display_name = source_names.get(source, source)
            page = c["meta"].get("page")
            page_label = f" | PAGE: {page}" if page else ""
            formatted_chunks.append(f"[SOURCE: {display_name}{page_label} | DIST: {c['distance']:.3f}]\n{c['doc']}")
            included_metadatas.append(c["meta"])

        unique_sources = list({m.get("source", "unknown") for m in included_metadatas})

        if not formatted_chunks:
            logger.info("retrieval_no_relevant_chunks query_len=%d user=%s", len(query), user_email)

        return {"context": "\n\n".join(formatted_chunks), "sources": unique_sources}

    async def _rerank(self, query: str, candidates: list[dict], top_k: int) -> list[dict]:
        """Ask the reranker LLM to pick the *top_k* most relevant of *candidates* (already distance-filtered
        and pool-sized). Falls back to plain distance order -- never raises and never blocks a reply -- on
        any failure: a malformed response, an unavailable model, or an index the model invented.
        """
        passages = "\n\n".join(f"[{i}] {c['doc'][:_RERANK_PASSAGE_CHARS]}" for i, c in enumerate(candidates))
        try:
            raw = await self.ai_service.rerank(
                [("system", RERANK_PROMPT), ("user", f"Question: {query}\n\nPassages:\n{passages}")]
            )
            ranked_indices = [int(i) for i in json.loads(raw)["ranked"]]
        except Exception:
            logger.warning("retrieval_rerank_failed query_len=%d n_candidates=%d", len(query), len(candidates), exc_info=True)
            return candidates[:top_k]

        seen: list[int] = []
        for i in ranked_indices + list(range(len(candidates))):
            if 0 <= i < len(candidates) and i not in seen:
                seen.append(i)
            if len(seen) >= top_k:
                break
        return [candidates[i] for i in seen]

    def get_max_indexed_pages(self, source_ids: list[str], user_email: str = "") -> dict[str, int]:
        """Highest page number actually ingested per document — a real,
        queryable fact (see PgVectorStore.max_pages), not a retrieval-based
        guess. Lets the chat prompt answer "how many pages" honestly instead
        of extrapolating from whatever chunks a similarity search surfaced."""
        return self.vector_store.max_pages(source_ids, user_email=user_email)

    # When a document must be cut to fit its budget, this share of the budget goes to its beginning and the
    # rest to its end. A document's conclusions and reference list live at the end, so a head-only cut
    # made "Extract references" and "Conclusions" fail on any long document.
    _HEAD_SHARE = 0.65

    def get_full_document_context(
        self,
        source_ids: list[str],
        user_email: str = "",
        source_names: dict[str, str] | None = None,
        max_chars: int | None = None,
    ) -> dict:
        """Every ingested chunk for the given documents, in original document
        order — not a top-k similarity search.

        For "how many / list all / total" questions, top-k retrieval
        structurally cannot answer correctly: it returns a handful of chunks
        ranked by similarity to the *query wording*, not the chunks needed
        to actually count or enumerate something across the whole document.
        This trades that off against context size — capped at *max_chars*
        (default rag_full_document_max_chars) so a very large document
        doesn't blow the model's context window or the request's latency/
        cost.

        The cap is split fairly across the selected documents (a short document's unused share is
        redistributed to longer ones), so every document is represented. It used to be one running total in
        source order, which let the first long document consume the whole budget and silently dropped every
        later document -- a "compare" over two papers could see only one.

        A document over its share keeps its beginning and its end, with an explicit marker for the omitted
        middle. ``truncated`` is True if any document was cut and ``truncated_sources`` names which ones, so
        the caller can tell the model a count from this context is a lower bound, not a guaranteed total.
        """
        source_names = source_names or {}
        cap = max_chars if max_chars is not None else int(runtime_settings.get("rag_full_document_max_chars"))

        chunks = self.vector_store.get_all_chunks(source_ids, user_email=user_email)

        pieces: dict[str, list[str]] = {}
        for c in chunks:
            page_label = f" | PAGE: {c['page']}" if c.get("page") else ""
            display_name = source_names.get(c["source"], c["source"])
            pieces.setdefault(c["source"], []).append(f"[SOURCE: {display_name}{page_label}]\n{c['content']}")

        # Present documents in the order the user selected them, not in database (uuid) order.
        ordered = [s for s in source_ids if s in pieces] + [s for s in pieces if s not in source_ids]
        sizes = {s: sum(len(p) + 2 for p in pieces[s]) for s in ordered}

        # Water-filling: smallest documents first, each takes what it needs up to an equal share of what is
        # left, so the unused part of a short document's share flows to the longer ones.
        budgets: dict[str, int] = {}
        remaining = cap
        by_size = sorted(ordered, key=lambda s: sizes[s])
        for i, src in enumerate(by_size):
            share = remaining // (len(by_size) - i)
            budgets[src] = min(sizes[src], share)
            remaining -= budgets[src]

        parts: list[str] = []
        truncated_sources: list[str] = []
        included = 0
        for src in ordered:
            doc_pieces = pieces[src]
            if sizes[src] <= budgets[src]:
                parts.extend(doc_pieces)
                included += len(doc_pieces)
                continue

            truncated_sources.append(src)
            marker = f"[SOURCE: {source_names.get(src, src)} — middle of this document omitted to fit the size limit]"
            usable = max(budgets[src] - len(marker) - 2, 0)
            head_budget = int(usable * self._HEAD_SHARE)

            head: list[str] = []
            used = 0
            for piece in doc_pieces:
                if used + len(piece) + 2 > head_budget:
                    break
                head.append(piece)
                used += len(piece) + 2

            tail: list[str] = []
            used = 0
            for piece in reversed(doc_pieces[len(head):]):
                if used + len(piece) + 2 > usable - sum(len(p) + 2 for p in head):
                    break
                tail.append(piece)
                used += len(piece) + 2
            tail.reverse()

            parts.extend(head)
            parts.append(marker)
            parts.extend(tail)
            included += len(head) + len(tail)

        return {
            "context": "\n\n".join(parts),
            "truncated": bool(truncated_sources),
            "chunk_count": included,
            "truncated_sources": truncated_sources,
        }

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
