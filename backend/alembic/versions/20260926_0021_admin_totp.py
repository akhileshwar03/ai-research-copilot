"""users.totp_secret / totp_enabled (admin two-factor)

Revision ID: 20260926_0021
Revises: 20260926_0020
Create Date: 2026-09-26
"""

from alembic import op
import sqlalchemy as sa

revision = "20260926_0021"
down_revision = "20260926_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_secret", sa.String(), nullable=True))
    op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")
