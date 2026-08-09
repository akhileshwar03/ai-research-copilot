"""finetune_samples — Humaniser LoRA fine-tune training data (Phase 2)

Offline tooling table (backend/scripts/finetune/), not used by the live app.

Revision ID: 20260802_0014
Revises: 20260801_0013
Create Date: 2026-08-02
"""
from alembic import op
import sqlalchemy as sa

revision = "20260802_0014"
down_revision = "20260801_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("finetune_samples"):
        op.create_table(
            "finetune_samples",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("human_text", sa.Text(), nullable=False),
            sa.Column("ai_text", sa.Text(), nullable=True),
            sa.Column("word_count", sa.Integer(), nullable=False),
            sa.Column("source", sa.String(), nullable=False),
            sa.Column("license", sa.String(), nullable=False),
            sa.Column("style", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="collected"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_finetune_samples_id", "finetune_samples", ["id"], unique=False)
        op.create_index("ix_finetune_samples_source", "finetune_samples", ["source"], unique=False)
        op.create_index("ix_finetune_samples_style", "finetune_samples", ["style"], unique=False)
        op.create_index("ix_finetune_samples_status", "finetune_samples", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_finetune_samples_status", table_name="finetune_samples")
    op.drop_index("ix_finetune_samples_style", table_name="finetune_samples")
    op.drop_index("ix_finetune_samples_source", table_name="finetune_samples")
    op.drop_index("ix_finetune_samples_id", table_name="finetune_samples")
    op.drop_table("finetune_samples")
