"""Vector store backed by pgvector, replacing the old Chroma-on-local-disk store.

Exposes the same add/query/delete_by_source/ping surface Chroma did, including
its Chroma-style ``where`` dict shape ({"user_email": x}, {"source": {"$in":
[...]}}, {"$and": [...]}) — the only shapes ever produced by
retrieval_service.py — so callers didn't need to change.
"""

import logging

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.db.models.document_chunk import DocumentChunk
from app.db.session import SessionLocal

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
