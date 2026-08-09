"""document_chunks table on pgvector — replaces the Chroma vector store

Chroma lived on the same ephemeral disk as uploaded PDFs and couldn't survive
a redeploy. This migration moves embeddings into Postgres itself (via the
pgvector extension), reusing the DB we're already durable on instead of
adding a third storage system.

Postgres-only: pgvector isn't available on SQLite, so this is a no-op there.
Local development against SQLite falls back to no RAG functionality until
DATABASE_URL points at a Postgres instance (e.g. a Neon branch).

Revision ID: 20260719_0011
Revises: 20260719_0010
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "20260719_0011"
down_revision = "20260719_0010"
branch_labels = None
depends_on = None

EMBEDDING_DIMENSIONS = 1536


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return

    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    if sa.inspect(conn).has_table("document_chunks"):
        return

    op.create_table(
        "document_chunks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("user_email", sa.String(), nullable=False),
        sa.Column("chunk", sa.Integer(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIMENSIONS), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_document_chunks_source", "document_chunks", ["source"])
    op.create_index("ix_document_chunks_user_email", "document_chunks", ["user_email"])
    op.execute(
        "CREATE INDEX ix_document_chunks_embedding_hnsw ON document_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    op.drop_table("document_chunks")
