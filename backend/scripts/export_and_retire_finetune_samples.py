"""One-time cleanup: get finetune_samples out of the live production database.

That table (see app/db/models/finetune_sample.py) is offline training data for the Humaniser
LoRA fine-tune -- the live app never reads it (zero references in app/api or app/services). It
ended up in production because backend/scripts/finetune/*.py connect via app.db.session's
SessionLocal, which uses whatever DATABASE_URL/.env happens to be active -- no explicit
--database-url flag the way scripts/reembed_chunks.py has one. Running this script does NOT fix
that root cause; it only cleans up the data that already leaked in. If you keep using the
finetune scripts against this same backend/.env, point DATABASE_URL at a throwaway database
first, the same way the project's other safety rule already asks for.

Two separate, explicit steps -- never combined into one command:

  1. EXPORT (read-only, safe to run anytime):
       python scripts/export_and_retire_finetune_samples.py --database-url "$PRODUCTION_DATABASE_URL" --export-to finetune_samples_backup.jsonl

     Writes every row to a JSONL file (one JSON object per line) and prints the row count written.
     Touches nothing in the database.

  2. DROP (only after you've looked at the exported file yourself):
       python scripts/export_and_retire_finetune_samples.py --database-url "$PRODUCTION_DATABASE_URL" --drop-after-export finetune_samples_backup.jsonl

     Re-counts the live table, re-reads the export file, and refuses to proceed unless the two
     counts match exactly. Then asks for a typed "yes" before issuing DROP TABLE finetune_samples.
     This is permanent -- there is no undo beyond the exported file.

SAFETY: --database-url is required and is never read from .env. The script refuses to run
against a database it cannot confirm is PostgreSQL with a real finetune_samples table in it (so
pointing it at an unrelated or empty database fails loudly instead of silently doing nothing).
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _connect(database_url: str):
    import os

    os.environ["DATABASE_URL"] = database_url
    os.environ.setdefault("ENVIRONMENT", "production")

    from app.db.session import engine

    return engine


def _row_count(engine) -> int:
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "finetune_samples" not in insp.get_table_names():
        print("No finetune_samples table found in this database -- nothing to do.")
        sys.exit(1)
    with engine.connect() as conn:
        return conn.execute(text("SELECT COUNT(*) FROM finetune_samples")).scalar_one()


def do_export(engine, export_to: Path) -> int:
    from sqlalchemy import text

    print(f"Target database: {engine.url.render_as_string(hide_password=True)}")
    total = _row_count(engine)
    print(f"finetune_samples has {total} rows. Exporting to {export_to} ...")

    written = 0
    with engine.connect() as conn, export_to.open("w", encoding="utf-8") as fh:
        result = conn.execution_options(stream_results=True).execute(
            text(
                "SELECT id, human_text, ai_text, word_count, source, license, style, status, created_at "
                "FROM finetune_samples ORDER BY id"
            )
        )
        for row in result:
            record = dict(row._mapping)
            created_at = record["created_at"]
            record["created_at"] = created_at.isoformat() if hasattr(created_at, "isoformat") else created_at
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
            written += 1

    print(f"Wrote {written} rows to {export_to}.")
    if written != total:
        print(f"WARNING: exported {written} rows but the table reported {total} -- re-run before trusting this export.")
        sys.exit(1)
    print("Export verified complete. The table itself has NOT been touched.")
    print(f"Next step, only once you've looked at {export_to} yourself:")
    print(f"  python scripts/export_and_retire_finetune_samples.py --database-url <...> --drop-after-export {export_to}")
    return written


def do_drop(engine, export_file: Path) -> None:
    from sqlalchemy import text

    print(f"Target database: {engine.url.render_as_string(hide_password=True)}")
    live_count = _row_count(engine)

    if not export_file.exists():
        print(f"Export file {export_file} does not exist. Run --export-to first.")
        sys.exit(1)
    with export_file.open(encoding="utf-8") as fh:
        exported_count = sum(1 for _ in fh)

    print(f"Live table: {live_count} rows. Export file: {exported_count} rows.")
    if exported_count != live_count:
        print(
            "REFUSING to drop: the export file's row count does not match the live table right now "
            "(someone may have written to it since you exported, or you pointed this at the wrong file/database). "
            "Re-run --export-to to get a fresh, matching backup first."
        )
        sys.exit(1)

    print(
        f"\nThis will permanently run: DROP TABLE finetune_samples ({live_count} rows) "
        f"on {engine.url.render_as_string(hide_password=True)}.\n"
        f"A verified backup of all {live_count} rows exists at {export_file.resolve()}.\n"
        "This cannot be undone beyond that backup file."
    )
    answer = input('Type "yes" to proceed: ').strip().lower()
    if answer != "yes":
        print("Not confirmed. Nothing was dropped.")
        sys.exit(0)

    with engine.begin() as conn:
        conn.execute(text("DROP TABLE finetune_samples"))
    print("Dropped finetune_samples. Done.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--database-url", required=True, help="Full SQLAlchemy URL of the database to act on. Required explicitly -- never read from .env.")
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--export-to", type=Path, help="Path to write the JSONL export to. Read-only; never drops anything.")
    group.add_argument("--drop-after-export", type=Path, help="Path to a previously written export file to verify against before dropping the table.")
    args = ap.parse_args()

    engine = _connect(args.database_url)

    if args.export_to:
        do_export(engine, args.export_to)
    else:
        do_drop(engine, args.drop_after_export)


if __name__ == "__main__":
    main()
