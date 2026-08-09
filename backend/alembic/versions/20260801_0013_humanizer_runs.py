"""humanizer_runs — Humaniser history (Phase 1 content history)

Revision ID: 20260801_0013
Revises: 20260719_0012
Create Date: 2026-08-01
"""
from alembic import op
import sqlalchemy as sa

revision = "20260801_0013"
down_revision = "20260719_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("humanizer_runs"):
        op.create_table(
            "humanizer_runs",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("input_text", sa.Text(), nullable=False),
            sa.Column("output_text", sa.Text(), nullable=False),
            sa.Column("style", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_humanizer_runs_id", "humanizer_runs", ["id"], unique=False)
        op.create_index("ix_humanizer_runs_user_id", "humanizer_runs", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_humanizer_runs_user_id", table_name="humanizer_runs")
    op.drop_index("ix_humanizer_runs_id", table_name="humanizer_runs")
    op.drop_table("humanizer_runs")
