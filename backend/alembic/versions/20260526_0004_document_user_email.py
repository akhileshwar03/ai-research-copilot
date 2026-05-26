"""add user_email to documents and drop global checksum uniqueness

Revision ID: 0004
Revises: 20260524_0003
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "20260524_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    existing_cols = {col["name"] for col in inspector.get_columns("documents")}
    existing_idx = {idx["name"] for idx in inspector.get_indexes("documents")}

    # Idempotent: skip if column already exists
    if "user_email" in existing_cols:
        return

    with op.batch_alter_table("documents", recreate="always") as batch_op:
        batch_op.add_column(sa.Column("user_email", sa.String(), nullable=True))
        batch_op.create_index("ix_documents_user_email", ["user_email"])
        # Drop unique index on checksum — uniqueness is now per-user, enforced in service
        if "ix_documents_checksum_sha256" in existing_idx:
            batch_op.drop_index("ix_documents_checksum_sha256")
        batch_op.create_index("ix_documents_checksum_sha256", ["checksum_sha256"])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_idx = {idx["name"] for idx in inspector.get_indexes("documents")}

    with op.batch_alter_table("documents", recreate="always") as batch_op:
        if "ix_documents_user_email" in existing_idx:
            batch_op.drop_index("ix_documents_user_email")
        batch_op.drop_column("user_email")
        if "ix_documents_checksum_sha256" in existing_idx:
            batch_op.drop_index("ix_documents_checksum_sha256")
        batch_op.create_index("ix_documents_checksum_sha256", ["checksum_sha256"], unique=True)
