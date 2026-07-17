import uuid

from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

from app.core.config import get_settings
from app.modules.rag.embedding_service import EmbeddingService
from app.modules.rag.vector_store_manager import VectorStoreManager


class IngestionService:
    def __init__(self, embedding_service: EmbeddingService, vector_store: VectorStoreManager):
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.settings = get_settings()

    def process_pdf(self, filepath: str, source_id: str, user_email: str = "") -> None:
        """Ingest a PDF and store chunks in the vector store.

        Text is split per page so every chunk carries its page number — the
        LLM can then cite "page N" instead of an opaque chunk index. Every
        chunk also carries ``user_email`` so retrieval stays scoped to one
        user without leaking other users' data.
        """
        reader = PdfReader(filepath)
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.settings.rag_chunk_size,
            chunk_overlap=self.settings.rag_chunk_overlap,
        )

        chunks: list[str] = []
        metadatas: list[dict] = []
        chunk_index = 0
        for page_number, page in enumerate(reader.pages, start=1):
            extracted = page.extract_text()
            if not extracted or not extracted.strip():
                continue
            for piece in splitter.split_text(extracted):
                chunks.append(piece)
                metadatas.append(
                    {
                        "source": source_id,
                        "chunk": chunk_index,
                        "page": page_number,
                        "user_email": user_email,
                    }
                )
                chunk_index += 1

        if not chunks:
            return

        vectors = self.embedding_service.embed_documents(chunks)
        ids = [str(uuid.uuid4()) for _ in chunks]
        self.vector_store.add(ids=ids, documents=chunks, embeddings=vectors, metadatas=metadatas)
