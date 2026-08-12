"""documents.page_count

The PDF's real total page count, captured during ingestion (pypdf's
len(reader.pages)) — lets the chat prompt state a confirmed page count
instead of "at least N pages indexed" (a lower bound derived from ingested
chunks, which reads as evasive to users when it happens to already be exact
— the direct trigger for this migration was a user reporting exactly that).

Revision ID: 20260811_0016
Revises: 20260810_0015
Create Date: 2026-08-11
"""

from alembic import op
import sqlalchemy as sa

revision = "20260811_0016"
down_revision = "20260810_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("page_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "page_count")
