"""add chat_messages.sources

Persists each assistant message's citation string so it survives reload —
previously it only ever existed in-memory on the client and vanished on
any refetch of the sessions list.

Revision ID: 20260719_0010
Revises: 20260719_0009
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa

revision = "20260719_0010"
down_revision = "20260719_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    cols = {c["name"] for c in sa.inspect(conn).get_columns("chat_messages")}
    if "sources" in cols:
        return

    op.add_column("chat_messages", sa.Column("sources", sa.Text(), nullable=True))


def downgrade() -> None:
    # SQLite does not support DROP COLUMN on older versions; recreate is the
    # standard workaround but is risky in production — left as a no-op.
    pass
