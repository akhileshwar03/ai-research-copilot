"""add user_email to documents and drop global checksum uniqueness

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("documents") as batch_op:
        batch_op.add_column(sa.Column("user_email", sa.String(), nullable=True))
        batch_op.create_index("ix_documents_user_email", ["user_email"])
        # Drop global uniqueness on checksum — uniqueness is now per-user (enforced in service)
        batch_op.drop_index("ix_documents_checksum_sha256")
        batch_op.create_index("ix_documents_checksum_sha256", ["checksum_sha256"])


def downgrade() -> None:
    with op.batch_alter_table("documents") as batch_op:
        batch_op.drop_index("ix_documents_user_email")
        batch_op.drop_column("user_email")
        batch_op.drop_index("ix_documents_checksum_sha256")
        batch_op.create_index("ix_documents_checksum_sha256", ["checksum_sha256"], unique=True)
