"""otp_tokens.code -> code_hash

Login OTP codes were stored in plaintext (compared with hmac.compare_digest,
but never hashed at rest) -- anyone with read access to the database could
read a live, unexpired sign-in code. Codes are short-lived (10 min TTL) and
rate/attempt-limited, so the real-world risk was low, but the fix is cheap
and there's no reason not to: hash with the same sha256 helper
(app.core.security.hash_token) already used for refresh tokens.

Any row still in the table at deploy time is a pending/mid-login code that
would be orphaned by the rename (no hash to compare against) -- deleting
them outright is simpler than backfilling a placeholder hash, and equally
harmless given the 10-minute TTL: anyone mid-login just requests a new code.

Revision ID: 20260924_0019
Revises: 20260914_0018
Create Date: 2026-09-24
"""

from alembic import op
import sqlalchemy as sa

revision = "20260924_0019"
down_revision = "20260914_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("DELETE FROM otp_tokens"))
    op.add_column("otp_tokens", sa.Column("code_hash", sa.String(), nullable=False))
    op.drop_column("otp_tokens", "code")


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM otp_tokens"))
    op.add_column("otp_tokens", sa.Column("code", sa.String(), nullable=False))
    op.drop_column("otp_tokens", "code_hash")
