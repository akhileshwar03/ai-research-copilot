"""documents.pinned

Adds a real, persisted pin flag on documents — mirrors chat_sessions.pinned.
Previously "Pin to top" for documents was a client-only Zustand flag with no
backend field at all, so it silently reset on every reload/relogin while
looking identical in the UI to the real, persisted session pin.

Revision ID: 20260810_0015
Revises: 20260802_0014
Create Date: 2026-08-10
"""

from alembic import op
import sqlalchemy as sa

revision = "20260810_0015"
down_revision = "20260802_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("documents", "pinned")
