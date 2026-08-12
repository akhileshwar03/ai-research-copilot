"""Vector store backed by pgvector, replacing the old Chroma-on-local-disk store.

Exposes the same add/query/delete_by_source/ping surface Chroma did, including
its Chroma-style ``where`` dict shape ({"user_email": x}, {"source": {"$in":
[...]}}, {"$and": [...]}) — the only shapes ever produced by
retrieval_service.py — so callers didn't need to change.
"""

import logging

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.db.models.document_chunk import DocumentChunk

logger = logging.getLogger(__name__)

_EMPTY_RESULT = {"documents": [[]], "metadatas": [[]], "distances": [[]]}


def _where_to_filters(where: dict | None) -> list[dict]:
    """Flatten a Chroma-style where dict into a list of {field: value | {"$in": [...]}} leaves."""
    if not where:
        return []
    if "$and" in where:
        leaves: list[dict] = []
        for clause in where["$and"]:
            leaves.extend(_where_to_filters(clause))
        return leaves
    return [where]


class PgVectorStore:
    def __init__(self):
        pass

    def _session(self) -> Session:
        # Deferred import (not a module-level one) so tests can monkeypatch
        # app.db.session.SessionLocal and have it actually take effect here —
        # same pattern retention_service.py already uses for the same reason.
        # A module-level `from app.db.session import SessionLocal` binds its
        # own name at import time, permanently pointing at the original
        # object; monkeypatching the source module afterward wouldn't reach it.
        from app.db.session import SessionLocal

        return SessionLocal()

    def add(self, ids: list[str], documents: list[str], embeddings: list[list[float]], metadatas: list[dict]) -> None:
        db = self._session()
        try:
            for chunk_id, content, embedding, meta in zip(ids, documents, embeddings, metadatas):
                db.add(
                    DocumentChunk(
                        id=chunk_id,
                        source=meta.get("source", ""),
                        user_email=meta.get("user_email", ""),
                        chunk=meta.get("chunk", 0),
                        page=meta.get("page"),
                        content=content,
                        embedding=embedding,
                    )
                )
            db.commit()
        finally:
            db.close()

    def query(self, query_embedding: list[float], n_results: int, where: dict | None = None):
        db = self._session()
        try:
            stmt = select(
                DocumentChunk,
                DocumentChunk.embedding.cosine_distance(query_embedding).label("distance"),
            )

            for leaf in _where_to_filters(where):
                for field, value in leaf.items():
                    column = getattr(DocumentChunk, field, None)
                    if column is None:
                        continue
                    if isinstance(value, dict) and "$in" in value:
                        stmt = stmt.where(column.in_(value["$in"]))
                    else:
                        stmt = stmt.where(column == value)

            stmt = stmt.order_by("distance").limit(n_results)

            rows = db.execute(stmt).all()
            documents = [row.DocumentChunk.content for row in rows]
            metadatas = [
                {
                    "source": row.DocumentChunk.source,
                    "chunk": row.DocumentChunk.chunk,
                    "page": row.DocumentChunk.page,
                    "user_email": row.DocumentChunk.user_email,
                }
                for row in rows
            ]
            distances = [float(row.distance) for row in rows]
            return {"documents": [documents], "metadatas": [metadatas], "distances": [distances]}
        except Exception:
            logger.exception("vector_store_query_failed n_results=%s", n_results)
            return _EMPTY_RESULT
        finally:
            db.close()

    def max_pages(self, source_ids: list[str], user_email: str = "") -> dict[str, int]:
        """Highest page number actually ingested for each source, from real
        chunk metadata — not an LLM guess from whatever chunks a similarity
        search happened to retrieve. Used to give the chat model a genuine,
        citable fact for "how many pages" questions instead of letting it
        extrapolate a total from a handful of retrieved excerpts.

        This is a lower bound, not a guaranteed exact page count: a page with
        no extractable text (blank, image-only, scanned) produces no chunk,
        so it never contributes here. Callers must present it as such.
        """
        if not source_ids:
            return {}
        db = self._session()
        try:
            stmt = (
                select(DocumentChunk.source, func.max(DocumentChunk.page))
                .where(DocumentChunk.source.in_(source_ids))
                .group_by(DocumentChunk.source)
            )
            if user_email:
                stmt = stmt.where(DocumentChunk.user_email == user_email)
            rows = db.execute(stmt).all()
            return {source: page for source, page in rows if page is not None}
        except Exception:
            logger.exception("vector_store_max_pages_failed source_ids=%s", source_ids)
            return {}
        finally:
            db.close()

    def get_all_chunks(self, source_ids: list[str], user_email: str = "") -> list[dict]:
        """Every chunk for the given documents, in original document order
        (source, then page, then chunk index) — not similarity-ranked, not
        limited to a handful of results.

        Exists specifically for aggregate/counting questions ("how many
        questions does it have", "list everything in section 3"), where
        `query()`'s top-k similarity search structurally cannot work: it
        returns a fixed small number of chunks most similar to the *query
        text*, not the chunks needed to see the whole document. A question
        like "how many" has no strong semantic similarity to the individual
        numbered items it needs to count, so top-k retrieval was surfacing
        an arbitrary handful and the model was left to extrapolate — exactly
        the failure mode that prompted this method's existence.
        """
        if not source_ids:
            return []
        db = self._session()
        try:
            stmt = select(DocumentChunk).where(DocumentChunk.source.in_(source_ids))
            if user_email:
                stmt = stmt.where(DocumentChunk.user_email == user_email)
            stmt = stmt.order_by(DocumentChunk.source, DocumentChunk.page, DocumentChunk.chunk)
            rows = db.execute(stmt).scalars().all()
            return [
                {"source": row.source, "page": row.page, "chunk": row.chunk, "content": row.content}
                for row in rows
            ]
        except Exception:
            logger.exception("vector_store_get_all_chunks_failed source_ids=%s", source_ids)
            return []
        finally:
            db.close()

    def get_chunks_by_pages(self, source_ids: list[str], pages: list[int], user_email: str = "") -> list[dict]:
        """Every chunk whose stored page metadata is exactly one of *pages*
        — an exact structural filter, not a similarity search. Accepts
        multiple pages in one query (e.g. "compare page 3 and page 8") so a
        multi-page question isn't silently answered from only the first
        page mentioned.

        Exists specifically for "what's on page N" / "which question is on
        page 25" style questions. Embedding similarity search has no way to
        search *by page number*: a page number isn't semantically meaningful
        text, so top-k retrieval for a query like "which question is in 25
        page" was returning whatever chunks happened to rank highest for
        that wording — not reliably chunks from page 25 at all — and the
        model was left to reconcile mismatched page labels on its own,
        producing exactly the kind of self-contradictory citation ("page 22
        excerpt, but indicated as part of the content around page 25") that
        prompted this method's existence.
        """
        if not source_ids or not pages:
            return []
        db = self._session()
        try:
            stmt = (
                select(DocumentChunk)
                .where(DocumentChunk.source.in_(source_ids), DocumentChunk.page.in_(pages))
                .order_by(DocumentChunk.source, DocumentChunk.page, DocumentChunk.chunk)
            )
            if user_email:
                stmt = stmt.where(DocumentChunk.user_email == user_email)
            rows = db.execute(stmt).scalars().all()
            return [
                {"source": row.source, "page": row.page, "chunk": row.chunk, "content": row.content}
                for row in rows
            ]
        except Exception:
            logger.exception("vector_store_get_chunks_by_pages_failed source_ids=%s pages=%s", source_ids, pages)
            return []
        finally:
            db.close()

    def delete_by_source(self, source_id: str) -> None:
        db = self._session()
        try:
            db.execute(delete(DocumentChunk).where(DocumentChunk.source == source_id))
            db.commit()
        finally:
            db.close()

    def ping(self) -> bool:
        db = self._session()
        try:
            db.execute(text("SELECT 1"))
            return True
        finally:
            db.close()
