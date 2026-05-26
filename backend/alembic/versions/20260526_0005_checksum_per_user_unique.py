"""change documents.checksum_sha256 from globally-unique to per-user unique

Previously the checksum had a GLOBAL unique index, so two different users
could not upload the same PDF.  The intent was always per-user uniqueness
(enforced in service code), so we replace the global index with a
composite unique index on (user_email, checksum_sha256).

Revision ID: 20260526_0005
Revises: 0004
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = "20260526_0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Idempotency: skip if already applied
    indexes = conn.execute(sa.text(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='documents'"
    )).fetchall()
    index_names = {row[0] for row in indexes}

    if "uq_documents_user_checksum" in index_names:
        return  # already applied

    # Drop the old globally-unique index (SQLite supports DROP INDEX)
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_documents_checksum_sha256"))

    # Recreate as non-unique (kept for query performance)
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_documents_checksum_sha256 "
        "ON documents (checksum_sha256)"
    ))

    # Add per-user composite unique index
    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_user_checksum "
        "ON documents (user_email, checksum_sha256)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS uq_documents_user_checksum"))
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_documents_checksum_sha256"))
    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_documents_checksum_sha256 "
        "ON documents (checksum_sha256)"
    ))
