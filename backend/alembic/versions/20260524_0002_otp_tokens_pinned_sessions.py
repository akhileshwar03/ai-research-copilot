"""add otp_tokens table and pinned column to chat_sessions

Revision ID: 20260524_0002
Revises: 20260523_0001
Create Date: 2026-05-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260524_0002"
down_revision: Union[str, Sequence[str], None] = "20260523_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "otp_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("purpose", sa.String(), nullable=False, server_default="auth"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_otp_tokens_id", "otp_tokens", ["id"], unique=False)
    op.create_index("ix_otp_tokens_email", "otp_tokens", ["email"], unique=False)

    # Add pinned column to chat_sessions
    op.add_column("chat_sessions", sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.text("0")))


def downgrade() -> None:
    op.drop_column("chat_sessions", "pinned")
    op.drop_index("ix_otp_tokens_email", table_name="otp_tokens")
    op.drop_index("ix_otp_tokens_id", table_name="otp_tokens")
    op.drop_table("otp_tokens")
