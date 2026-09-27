"""chat_quota_usage: per-user, per-UTC-day counter for capped (expensive) chat requests

Whole-document requests (research actions and counting questions) send tens of thousands of tokens to the
model, roughly 15x a normal question, so they get a daily allowance per user.

Revision ID: 20260927_0024
Revises: 20260927_0023
Create Date: 2026-09-27
"""

from alembic import op
import sqlalchemy as sa

revision = "20260927_0024"
down_revision = "20260927_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_quota_usage",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("kind", sa.String(), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("chat_quota_usage")
