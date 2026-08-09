from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.db.session import Base

EMBEDDING_DIMENSIONS = 1536  # OpenAI text-embedding-ada-002

# SQLite (used by the test suite) has no vector type — fall back to Text there
# so Base.metadata.create_all() can still build the table for DDL purposes.
# The pgvector-specific query path (PgVectorStore) is only ever exercised
# against real Postgres, in dev and prod alike.
_embedding_type = Vector(EMBEDDING_DIMENSIONS).with_variant(Text(), "sqlite")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(String, primary_key=True)
    source = Column(String, nullable=False, index=True)  # documents.stored_filename
    user_email = Column(String, nullable=False, index=True)
    chunk = Column(Integer, nullable=False)
    page = Column(Integer, nullable=True)
    content = Column(Text, nullable=False)
    embedding = Column(_embedding_type, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
