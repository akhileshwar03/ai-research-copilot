"""add chat_sessions.document_ids

Adds a JSON-encoded document_ids column to chat_sessions so a chat can be
scoped to a specific set of documents (multi-document compare), persisted
per session instead of a single global "selected document."

Revision ID: 20260719_0009
Revises: 20260716_0008
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa

revision = "20260719_0009"
down_revision = "20260716_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Idempotency: skip if the column already exists (e.g. applied via startup migration).
    cols = {c["name"] for c in sa.inspect(conn).get_columns("chat_sessions")}
    if "document_ids" in cols:
        return

    op.add_column("chat_sessions", sa.Column("document_ids", sa.Text(), nullable=True))


def downgrade() -> None:
    # SQLite does not support DROP COLUMN on older versions; recreate is the
    # standard workaround but is risky in production — left as a no-op.
    pass
