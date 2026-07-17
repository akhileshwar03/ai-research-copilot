"""add chat_sessions.created_at

Adds a created_at timestamp to chat_sessions so sessions can be sorted and
displayed by real creation time instead of using the surrogate id as a proxy.
Existing rows receive CURRENT_TIMESTAMP as their created_at value.

Revision ID: 20260601_0006
Revises: 20260526_0005
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = "20260601_0006"
down_revision = "20260526_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Idempotency: skip if the column already exists (e.g. applied via startup migration).
    cols = {c["name"] for c in sa.inspect(conn).get_columns("chat_sessions")}
    if "created_at" in cols:
        return

    # SQLite ALTER TABLE ADD COLUMN cannot have a non-constant default, so we
    # add the column as nullable first, back-fill with the current timestamp,
    # then let new rows use server_default=func.now() enforced at the ORM layer.
    # op.add_column renders the right column type per dialect (DATETIME on
    # SQLite, TIMESTAMP WITH TIME ZONE on PostgreSQL).
    op.add_column("chat_sessions", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    conn.execute(sa.text(
        "UPDATE chat_sessions SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"
    ))


def downgrade() -> None:
    # SQLite does not support DROP COLUMN on older versions; recreate is the
    # standard workaround but is risky in production — left as a no-op.
    pass
