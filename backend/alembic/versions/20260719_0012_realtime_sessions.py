"""realtime_sessions + realtime_messages — independent history for Real-time AI

Deliberately separate tables from chat_sessions/chat_messages: Real-time AI
and Research Copilot are decoupled products that only connect via the
marketing page, not shared storage.

Revision ID: 20260719_0012
Revises: 20260719_0011
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa

revision = "20260719_0012"
down_revision = "20260719_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("realtime_sessions"):
        op.create_table(
            "realtime_sessions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(), nullable=True),
            sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_realtime_sessions_id", "realtime_sessions", ["id"], unique=False)

    if not inspector.has_table("realtime_messages"):
        op.create_table(
            "realtime_messages",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("role", sa.String(), nullable=True),
            sa.Column("content", sa.Text(), nullable=True),
            sa.Column("session_id", sa.Integer(), nullable=True),
            sa.Column("sources", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["session_id"], ["realtime_sessions.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_realtime_messages_id", "realtime_messages", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_realtime_messages_id", table_name="realtime_messages")
    op.drop_table("realtime_messages")

    op.drop_index("ix_realtime_sessions_id", table_name="realtime_sessions")
    op.drop_table("realtime_sessions")
