"""chat_sessions.created_at database default

Migration 0006 added chat_sessions.created_at as a plain nullable column with no default, so every
session created since has NULL there and admin analytics never counted a session. Rows that are
already NULL have no recoverable creation time and are left as they are (the analytics ignore
them); new rows get a real timestamp from the database default (and from the model).

Revision ID: 20260926_0022
Revises: 20260926_0021
Create Date: 2026-09-26
"""

from alembic import op
import sqlalchemy as sa

revision = "20260926_0022"
down_revision = "20260926_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.alter_column("chat_sessions", "created_at", existing_type=sa.DateTime(timezone=True), server_default=sa.func.now())


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.alter_column("chat_sessions", "created_at", existing_type=sa.DateTime(timezone=True), server_default=None)
