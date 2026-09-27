"""documents.{reference,figure,table}_count(_exact): real structural facts computed at ingestion, not a
model's guess over truncated context. See app/modules/rag/structure_detector.py.

Revision ID: 20260928_0025
Revises: 20260927_0024
Create Date: 2026-09-28
"""

from alembic import op
import sqlalchemy as sa

revision = "20260928_0025"
down_revision = "20260927_0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("reference_count", sa.Integer(), nullable=True))
    op.add_column("documents", sa.Column("reference_count_exact", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("documents", sa.Column("figure_count", sa.Integer(), nullable=True))
    op.add_column("documents", sa.Column("figure_count_exact", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("documents", sa.Column("table_count", sa.Integer(), nullable=True))
    op.add_column("documents", sa.Column("table_count_exact", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("documents", "table_count_exact")
    op.drop_column("documents", "table_count")
    op.drop_column("documents", "figure_count_exact")
    op.drop_column("documents", "figure_count")
    op.drop_column("documents", "reference_count_exact")
    op.drop_column("documents", "reference_count")
