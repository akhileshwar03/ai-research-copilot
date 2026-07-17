"""add user_email to documents and drop global checksum uniqueness

Revision ID: 0004
Revises: 20260524_0003
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "20260524_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── Idempotency check (dialect-agnostic) ───────────────────────────────────
    cols = {c["name"] for c in sa.inspect(conn).get_columns("documents")}
    if "user_email" in cols:
        return  # already applied

    if conn.dialect.name != "sqlite":
        # PostgreSQL (and anything else sane) supports plain ADD COLUMN.
        # The checksum uniqueness change is handled portably in revision 0005.
        op.add_column("documents", sa.Column("user_email", sa.String(), nullable=True))
        op.create_index("ix_documents_user_email", "documents", ["user_email"], unique=False)
        return

    # ── SQLite: recreate documents table with user_email + no global checksum unique ──
    # SQLite does not support ALTER TABLE DROP CONSTRAINT, so we use the
    # rename-create-copy-drop pattern with raw SQL (most reliable on SQLite).
    conn.execute(sa.text("""
        CREATE TABLE _documents_new (
            id            INTEGER  PRIMARY KEY NOT NULL,
            user_email    VARCHAR,
            original_filename  VARCHAR NOT NULL,
            stored_filename    VARCHAR NOT NULL,
            content_type  VARCHAR NOT NULL,
            size_bytes    INTEGER NOT NULL,
            checksum_sha256 VARCHAR NOT NULL,
            upload_status VARCHAR NOT NULL,
            error_message TEXT,
            created_at    DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )
    """))

    conn.execute(sa.text("""
        INSERT INTO _documents_new
            (id, original_filename, stored_filename, content_type,
             size_bytes, checksum_sha256, upload_status, error_message, created_at)
        SELECT
            id, original_filename, stored_filename, content_type,
            size_bytes, checksum_sha256, upload_status, error_message, created_at
        FROM documents
    """))

    conn.execute(sa.text("DROP TABLE documents"))
    conn.execute(sa.text("ALTER TABLE _documents_new RENAME TO documents"))

    # Recreate all indexes (stored_filename stays unique; checksum no longer unique)
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_documents_id ON documents (id)"
    ))
    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_documents_stored_filename "
        "ON documents (stored_filename)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_documents_checksum_sha256 "
        "ON documents (checksum_sha256)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_documents_user_email "
        "ON documents (user_email)"
    ))


def downgrade() -> None:
    conn = op.get_bind()

    cols = {c["name"] for c in sa.inspect(conn).get_columns("documents")}
    if "user_email" not in cols:
        return  # nothing to undo

    if conn.dialect.name != "sqlite":
        op.drop_index("ix_documents_user_email", table_name="documents")
        op.drop_column("documents", "user_email")
        return

    conn.execute(sa.text("""
        CREATE TABLE _documents_old (
            id            INTEGER  PRIMARY KEY NOT NULL,
            original_filename  VARCHAR NOT NULL,
            stored_filename    VARCHAR NOT NULL,
            content_type  VARCHAR NOT NULL,
            size_bytes    INTEGER NOT NULL,
            checksum_sha256 VARCHAR NOT NULL UNIQUE,
            upload_status VARCHAR NOT NULL,
            error_message TEXT,
            created_at    DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )
    """))

    conn.execute(sa.text("""
        INSERT OR IGNORE INTO _documents_old
            (id, original_filename, stored_filename, content_type,
             size_bytes, checksum_sha256, upload_status, error_message, created_at)
        SELECT
            id, original_filename, stored_filename, content_type,
            size_bytes, checksum_sha256, upload_status, error_message, created_at
        FROM documents
    """))

    conn.execute(sa.text("DROP TABLE documents"))
    conn.execute(sa.text("ALTER TABLE _documents_old RENAME TO documents"))

    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_documents_id ON documents (id)"
    ))
    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_documents_stored_filename "
        "ON documents (stored_filename)"
    ))
    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_documents_checksum_sha256 "
        "ON documents (checksum_sha256)"
    ))
