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

        Every chunk carries ``user_email`` in its metadata so that retrieval
        queries can be scoped to a single user without leaking other users' data.
        """
        reader = PdfReader(filepath)
        text = ""
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                text += extracted

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.settings.rag_chunk_size,
            chunk_overlap=self.settings.rag_chunk_overlap,
        )
        chunks = splitter.split_text(text)
        if not chunks:
            return

        vectors = self.embedding_service.embed_documents(chunks)
        ids = [str(uuid.uuid4()) for _ in chunks]
        metadatas = [
            {"source": source_id, "chunk": i, "user_email": user_email}
            for i in range(len(chunks))
        ]
        self.vector_store.add(ids=ids, documents=chunks, embeddings=vectors, metadatas=metadatas)
