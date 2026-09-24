#!/usr/bin/env bash
# Starts a fresh backend instance for the Playwright e2e suite, against a
# real local Postgres (not SQLite — app/modules/rag/pgvector_store.py and
# the document_chunks.embedding VECTOR column categorically require
# pgvector; SQLite silently can't run ingestion/retrieval at all, per
# backend/.env.example's own comment). One-time local setup, matching what
# CI's postgres-matrix job does with a Docker service container instead:
#
#   brew install postgresql@17 pgvector
#   LC_ALL="en_US.UTF-8" /opt/homebrew/opt/postgresql@17/bin/pg_ctl \
#     -D /opt/homebrew/var/postgresql@17 -l /tmp/postgres17.log start
#   /opt/homebrew/opt/postgresql@17/bin/createuser -s querex_e2e
#   /opt/homebrew/opt/postgresql@17/bin/createdb -O querex_e2e querex_e2e
#
# (pgvector's Homebrew bottle only ships for postgresql@17/@18, not @16 —
# use 17 for this, independent of whatever Postgres version you use
# elsewhere.) This script assumes that's already done and the server is
# running; it only resets the querex_e2e database's contents each run.
set -euo pipefail

PSQL_BIN="/opt/homebrew/opt/postgresql@17/bin/psql"
export DATABASE_URL="postgresql://querex_e2e@127.0.0.1:5432/querex_e2e"

if ! "$PSQL_BIN" -d querex_e2e -c "SELECT 1" > /dev/null 2>&1; then
  echo "==> Local Postgres (querex_e2e db) isn't reachable." >&2
  echo "    See the setup steps in this file's header comment, then retry." >&2
  exit 1
fi

# Fresh schema every run — same spirit as the SQLite path's `rm -f` on the
# db file, just the Postgres equivalent (a real server persists data
# between runs, unlike a deleted-and-recreated SQLite file).
"$PSQL_BIN" -d querex_e2e -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE EXTENSION vector;"

cd "$(dirname "$0")/../../backend"

# R2_* forced empty regardless of backend/.env: storage_service.py falls
# back to local disk when any of the four are unset. Without this, e2e
# uploads real (if tiny) files to the REAL production R2 bucket
# (querex-uploads) -- confirmed this actually happened before this fix was
# added; see git history for the cleanup.
COMMON_ENV=(
  ADMIN_EMAILS=admin@example.com
  ENVIRONMENT=development
  RATE_LIMIT_ENABLED=false
  TAVILY_API_KEY=
  RESEND_API_KEY=
  SMTP_HOST=
  R2_ACCOUNT_ID=
  R2_ACCESS_KEY_ID=
  R2_SECRET_ACCESS_KEY=
  R2_BUCKET_NAME=
  "FRONTEND_ORIGINS=http://127.0.0.1:${FRONTEND_PORT:-3099},http://localhost:${FRONTEND_PORT:-3099}"
)

env "${COMMON_ENV[@]}" venv/bin/alembic upgrade head

exec env "${COMMON_ENV[@]}" venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${BACKEND_PORT:-8099}"
