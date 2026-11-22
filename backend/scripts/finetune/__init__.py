"""Humaniser fine-tune tooling. Importing ANY module in this package runs the guard below first.

WHY THIS EXISTS: every script here reaches the database through app.db.session, which reads
DATABASE_URL from backend/.env -- and that file is PRODUCTION Neon. The pipeline once ran straight
against it, which left a 113 MB, 27,000-row offline-training table inside the live database (95% of
its storage), and one mistyped command away from worse. Nothing in this package should ever touch
production by default, so:

  * By default the scripts use a local SQLite file (scripts/finetune/data/finetune_local.db),
    created on first use. backend/.env's DATABASE_URL is overridden, never read.
  * To use a different database, set FINETUNE_DATABASE_URL explicitly for that command:
        FINETUNE_DATABASE_URL="postgresql://..." python -m scripts.finetune.collect
  * A Neon (neon.tech) URL is refused unless FINETUNE_ALLOW_PRODUCTION=yes is ALSO set, so
    pointing at the live database always takes two deliberate, visible steps.

Scripts that never touch the database (eval, probes) are unaffected -- the override only changes
what DATABASE_URL resolves to for code that goes on to import app.db.session.
"""

import os
import sys
from pathlib import Path

_DEFAULT_LOCAL_DB = Path(__file__).resolve().parent / "data" / "finetune_local.db"


def _choose_database_url(env: dict) -> str:
    explicit = (env.get("FINETUNE_DATABASE_URL") or "").strip()
    if not explicit:
        return f"sqlite:///{_DEFAULT_LOCAL_DB}"
    if "neon.tech" in explicit.lower() and env.get("FINETUNE_ALLOW_PRODUCTION", "").strip().lower() != "yes":
        raise SystemExit(
            "Refusing to run: FINETUNE_DATABASE_URL points at Neon (production). The fine-tune scripts "
            "must not use the live database by default. If you really mean to, set "
            "FINETUNE_ALLOW_PRODUCTION=yes for this one command as well."
        )
    return explicit


def _apply_guard() -> None:
    url = _choose_database_url(os.environ)
    os.environ["DATABASE_URL"] = url  # environment wins over backend/.env in pydantic-settings
    if url.startswith("sqlite"):
        _DEFAULT_LOCAL_DB.parent.mkdir(parents=True, exist_ok=True)
        print(f"[finetune] database: {url} (local; backend/.env's DATABASE_URL is NOT used)", file=sys.stderr)
        try:  # a fresh local file has no table yet; create just this one (never touches other tables)
            from app.db.models.finetune_sample import FinetuneSample
            from app.db.session import engine

            FinetuneSample.__table__.create(bind=engine, checkfirst=True)
        except Exception as exc:  # DB-free scripts must keep working even if the app isn't importable
            print(f"[finetune] note: could not pre-create the local table ({type(exc).__name__})", file=sys.stderr)
    else:
        print("[finetune] database: explicit FINETUNE_DATABASE_URL (not backend/.env)", file=sys.stderr)


_apply_guard()
