import logging

import chromadb

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_EMPTY_RESULT = {"documents": [[]], "metadatas": [[]]}


class VectorStoreManager:
    def __init__(self):
        settings = get_settings()
        self.client = chromadb.PersistentClient(path=settings.chroma_path)
        self.collection = self.client.get_or_create_collection(name=settings.chroma_collection)

    def add(self, ids: list[str], documents: list[str], embeddings: list[list[float]], metadatas: list[dict]) -> None:
        self.collection.add(ids=ids, documents=documents, embeddings=embeddings, metadatas=metadatas)

    def query(self, query_embedding: list[float], n_results: int, where: dict | None = None):
        count = self.collection.count()
        if count == 0:
            return _EMPTY_RESULT

        actual_n = min(n_results, count)
        args: dict = {"query_embeddings": [query_embedding], "n_results": actual_n}
        if where:
            args["where"] = where

        try:
            return self.collection.query(**args)
        except Exception:
            logger.exception("vector_store_query_failed n_results=%s count=%s", actual_n, count)
            return _EMPTY_RESULT

    def delete_by_source(self, source_id: str) -> None:
        self.collection.delete(where={"source": source_id})

    def ping(self) -> bool:
        self.client.heartbeat()
        return True
