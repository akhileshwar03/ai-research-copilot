"""add email_verified to users

Revision ID: 20260524_0003
Revises: 20260524_0002
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa

revision = "20260524_0003"
down_revision = "20260524_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("users", "email_verified")
