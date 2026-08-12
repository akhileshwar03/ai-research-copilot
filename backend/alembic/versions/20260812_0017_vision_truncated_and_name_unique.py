"""documents.vision_truncated + per-user unique document name

vision_truncated: true when a document had more vision-candidate pages than
vision_ingestion_max_pages allowed captioning, so the chat prompt can
honestly say "some diagrams weren't indexed" instead of a skipped-for-cost
page looking identical to "there's no chart there."

uq_documents_user_name: a real database-level backstop for the app-level
duplicate-name rejection added in DocumentService.initiate_upload. Without
this, two genuinely concurrent uploads of a new, same-named file could both
pass the app-level "does this name exist yet?" check before either commits,
and both succeed — the exact race the checksum dedup already had a DB
constraint (uq_documents_user_checksum) to catch, which this mirrors.
Case-insensitive (functional index on lower(original_filename)) to match
the app-level check.

Defensively resolves any pre-existing duplicate names first — a document
uploaded before this constraint existed could otherwise make the index
creation itself fail with an IntegrityError and block the whole deploy.
Nothing is deleted: the earliest (lowest id) row per (user, name) keeps its
name; later duplicates get a disambiguating " (duplicate N)" suffix.

Revision ID: 20260812_0017
Revises: 20260811_0016
Create Date: 2026-08-12
"""

from alembic import op
import sqlalchemy as sa

revision = "20260812_0017"
down_revision = "20260811_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("vision_truncated", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT id, user_email, original_filename
            FROM documents
            WHERE user_email IS NOT NULL
            ORDER BY user_email, lower(original_filename), id
            """
        )
    ).fetchall()

    seen: dict[tuple, int] = {}
    for row in rows:
        key = (row.user_email, row.original_filename.lower())
        if key in seen:
            seen[key] += 1
            new_name = f"{row.original_filename} (duplicate {seen[key]})"
            conn.execute(
                sa.text("UPDATE documents SET original_filename = :name WHERE id = :id"),
                {"name": new_name, "id": row.id},
            )
        else:
            seen[key] = 1

    op.execute(
        "CREATE UNIQUE INDEX uq_documents_user_name ON documents (user_email, lower(original_filename))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_documents_user_name")
    op.drop_column("documents", "vision_truncated")
