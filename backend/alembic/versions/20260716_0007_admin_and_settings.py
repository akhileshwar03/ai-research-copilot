"""admin role, OTP attempt counter, runtime app_settings table

- users.is_admin: admin panel role flag (bootstrapped from ADMIN_EMAILS)
- otp_tokens.attempts: per-token failed-attempt counter (brute-force cap)
- app_settings: admin-adjustable runtime settings (limits, RAG params)

All operations are dialect-agnostic (SQLite + PostgreSQL) and idempotent so
they coexist with the SQLite startup migrations on Render's ephemeral disk.

Revision ID: 20260716_0007
Revises: 20260601_0006
Create Date: 2026-07-16
"""
from alembic import op
import sqlalchemy as sa

revision = "20260716_0007"
down_revision = "20260601_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    user_cols = {c["name"] for c in inspector.get_columns("users")}
    if "is_admin" not in user_cols:
        op.add_column(
            "users",
            sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    otp_cols = {c["name"] for c in inspector.get_columns("otp_tokens")}
    if "attempts" not in otp_cols:
        op.add_column(
            "otp_tokens",
            sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        )

    if not inspector.has_table("app_settings"):
        op.create_table(
            "app_settings",
            sa.Column("key", sa.String(), primary_key=True),
            sa.Column("value", sa.String(), nullable=False),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )


def downgrade() -> None:
    op.drop_table("app_settings")
    conn = op.get_bind()
    if conn.dialect.name != "sqlite":
        op.drop_column("otp_tokens", "attempts")
        op.drop_column("users", "is_admin")
    # SQLite cannot drop columns on older versions; is_admin/attempts are
    # harmless leftovers on downgrade there.
