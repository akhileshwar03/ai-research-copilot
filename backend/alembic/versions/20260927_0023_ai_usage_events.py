"""ai_usage_events: provider-reported token counts per model call

Raw token counts only (no prices, no text), attributed to a user and tool, so per-user cost can be
computed from a verified pricing table without rewriting history.

Revision ID: 20260927_0023
Revises: 20260926_0022
Create Date: 2026-09-27
"""

from alembic import op
import sqlalchemy as sa

revision = "20260927_0023"
down_revision = "20260926_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_usage_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tool", sa.String(), nullable=True),
        sa.Column("request_id", sa.String(), nullable=True),
        sa.Column("kind", sa.String(), nullable=False, server_default="chat"),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cached_input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_usage_events_id", "ai_usage_events", ["id"])
    op.create_index("ix_ai_usage_events_user_id", "ai_usage_events", ["user_id"])
    op.create_index("ix_ai_usage_events_tool", "ai_usage_events", ["tool"])
    op.create_index("ix_ai_usage_events_created_at", "ai_usage_events", ["created_at"])


def downgrade() -> None:
    op.drop_table("ai_usage_events")
