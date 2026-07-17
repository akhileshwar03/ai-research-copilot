"""one_time_codes table — DB-backed single-use codes

Replaces the in-memory OAuth exchange/state stores and the deleted-account
denylist so the app is safe with multiple workers or instances.

Revision ID: 20260716_0008
Revises: 20260716_0007
Create Date: 2026-07-16
"""
from alembic import op
import sqlalchemy as sa

revision = "20260716_0008"
down_revision = "20260716_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    if sa.inspect(conn).has_table("one_time_codes"):
        return

    op.create_table(
        "one_time_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code_hash", sa.String(), nullable=False),
        sa.Column("purpose", sa.String(), nullable=False),
        sa.Column("payload", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_one_time_codes_code_hash", "one_time_codes", ["code_hash"], unique=True)
    op.create_index("ix_one_time_codes_purpose", "one_time_codes", ["purpose"], unique=False)


def downgrade() -> None:
    op.drop_table("one_time_codes")
