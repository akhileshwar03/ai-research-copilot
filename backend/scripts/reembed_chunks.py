"""Re-embed every row in document_chunks under a NEW embedding model, in place.

Required before switching the `rag_embedding_model` runtime setting: old vectors were produced by a different
model, so comparing them against new-model query vectors is meaningless even though the column's dimension
(1536) happens to match for both text-embedding-ada-002 and text-embedding-3-small. Retrieval on documents
ingested before the switch would silently return near-random chunks until this has run.

Dry-run by default (counts rows and estimates cost/tokens, writes nothing). Pass --execute to actually update.
Batched, resumable (skips rows already matching --to-model in a `--marker-column`... this script keeps it
simpler: it always re-embeds every row named, since a partial run is safe to just re-run in full).

SAFETY: refuses to run unless DATABASE_URL is explicitly passed on the command line (never picked up from
backend/.env, which is PRODUCTION Neon per project memory) -- forces you to look at exactly which database
you are about to write to before it runs. Running this against production is a deliberate, one-time step you
take after reading its printed summary, never something to automate.

Usage:
  # 1. Dry run first -- always. Shows row count, model, and estimated one-time cost.
  python scripts/reembed_chunks.py --database-url "$PRODUCTION_DATABASE_URL" --to-model text-embedding-3-small

  # 2. Only once that summary looks right:
  python scripts/reembed_chunks.py --database-url "$PRODUCTION_DATABASE_URL" --to-model text-embedding-3-small --execute

  # 3. Only then, flip the rag_embedding_model runtime setting (admin panel or the settings API) to match.
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--database-url", required=True, help="Full SQLAlchemy URL of the database to re-embed. Required explicitly -- never read from .env.")
    ap.add_argument("--to-model", required=True, choices=["text-embedding-ada-002", "text-embedding-3-small"])
    ap.add_argument("--batch-size", type=int, default=200)
    ap.add_argument("--execute", action="store_true", help="Actually write. Without this, only a dry-run summary is printed.")
    args = ap.parse_args()

    import os

    os.environ["DATABASE_URL"] = args.database_url
    os.environ.setdefault("ENVIRONMENT", "production")

    from sqlalchemy import func, select

    from app.core.config import get_settings
    from app.db.models.document_chunk import DocumentChunk
    from app.db.session import SessionLocal, engine
    from app.services.ai_pricing import cost_usd
    from app.services.ai_usage import _MeteredEmbeddingsClient
    from langchain_openai import OpenAIEmbeddings

    print(f"Target database: {engine.url.render_as_string(hide_password=True)}")
    settings = get_settings()

    db = SessionLocal()
    try:
        total = db.execute(select(func.count(DocumentChunk.id))).scalar_one()
        total_chars = db.execute(select(func.coalesce(func.sum(func.length(DocumentChunk.content)), 0))).scalar_one()
    finally:
        db.close()

    est_tokens = int(total_chars / 4)  # rough chars-per-token estimate, for a dry-run heads-up only
    est_cost = cost_usd(args.to_model, est_tokens, 0)
    print(f"{total} chunks, ~{total_chars:,} characters (~{est_tokens:,} tokens).")
    print(f"Re-embedding all of them with {args.to_model}: estimated cost ~${est_cost:.4f}" if est_cost is not None else "cost: unpriced model")

    if total == 0:
        print("Nothing to do.")
        return
    if not args.execute:
        print("\nDRY RUN -- no rows changed. Re-run with --execute to actually re-embed.")
        return

    embedder = OpenAIEmbeddings(model=args.to_model, api_key=settings.openai_api_key)
    embedder.client = _MeteredEmbeddingsClient(embedder.client, embedder.model)

    done = 0
    t0 = time.time()
    while True:
        db = SessionLocal()
        try:
            rows = db.execute(select(DocumentChunk).order_by(DocumentChunk.id).offset(done).limit(args.batch_size)).scalars().all()
            if not rows:
                break
            vectors = embedder.embed_documents([r.content for r in rows])
            for row, vec in zip(rows, vectors):
                row.embedding = vec
            db.commit()
        finally:
            db.close()
        done += len(rows)
        print(f"  {done}/{total} re-embedded ({time.time() - t0:.0f}s elapsed)", flush=True)

    print(f"\nDone: {done} chunks now embedded with {args.to_model}.")
    print("Next: set the rag_embedding_model runtime setting to this model so new ingestion/queries match.")


if __name__ == "__main__":
    main()
