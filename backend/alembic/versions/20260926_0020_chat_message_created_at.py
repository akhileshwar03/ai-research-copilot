"""chat_messages.created_at

Chat messages had no timestamp of their own, so admin analytics could only
attribute a message to the day its *session* started -- a long-running
conversation's messages were all counted on day one. Existing rows are
backfilled with their session's creation time (the best information that
exists); new rows get the real insertion time.

Revision ID: 20260926_0020
Revises: 20260924_0019
Create Date: 2026-09-26
"""

from alembic import op
import sqlalchemy as sa

revision = "20260926_0020"
down_revision = "20260924_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        sa.text(
            "UPDATE chat_messages SET created_at = "
            "(SELECT created_at FROM chat_sessions WHERE chat_sessions.id = chat_messages.session_id)"
        )
    )
    op.execute(sa.text("UPDATE chat_messages SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
    op.alter_column(
        "chat_messages",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
    )
    op.create_index("ix_chat_messages_created_at", "chat_messages", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_created_at", table_name="chat_messages")
    op.drop_column("chat_messages", "created_at")
