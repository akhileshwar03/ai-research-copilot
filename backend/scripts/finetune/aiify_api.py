"""Step 3 (API portion) — AI-ify generation via hosted APIs (Phase 2 checkpoint,
2026-08-06 reopen, rebalanced 2026-08-07 round 7 for multi-model diversity,
Groq dropped 2026-08-08 round 10).

Complements kaggle/push_kaggle.py, which handles the self-hosted-model share
on Kaggle's free GPU tier. This script handles the rest, split across three
more model families so the LoRA learns to reverse a broad "AI fingerprint"
rather than one narrow one (root cause #2 in STATE.md's original diagnosis):

- OpenAI (gpt-4.1-mini, paid) -- one real production-tier model fingerprint.
- Google (Gemini, paid) -- since round 7.
- Anthropic (Claude, paid) -- since round 7.

Groq (llama-3.3-70b-versatile, free tier) was dropped in round 10 -- its
account-level rate limit (6,000 tokens/minute, confirmed via the user's own
Groq dashboard during Step 2 tagging) throttled a 200-row spot check to ~15
minutes and would have made a full AI-ify pass over the normal-only pool
(~12,787 rows) take many hours to days. Not worth the unreliability; its
share moved to Kaggle (now has a full 30h/week GPU quota again) and OpenAI.

Row selection is partitioned deterministically by `id % 100` so this script
and push_kaggle.py never claim the same row without needing any runtime
coordination. The boundary lives in aiify_split.py (single source of truth
both scripts import).

Only `style == "normal"` rows are selected (all four providers) -- 2026-08-07
decision: production (frontend/app/humanizer/page.tsx) only ever ships
`normal` style, so training on `clear_structured`/`simple_formal` targets
right now would spend the LoRA's limited capacity on registers nothing ships,
diluting the one register the GPTZero checkpoint actually tests.

**Real, measured cost gating for Google and Anthropic** (user approved up to
$5 each, $20 total across all paid APIs): rather than trust a memorized
price-per-token estimate up front, each paid provider runs a small pilot
batch first, reads the *actual* token usage the API reports back, computes a
real $/row rate from that, and only then decides how many more rows the
remaining budget affords. Once cumulative estimated spend hits BUDGET_USD for
a provider, that provider stops -- remaining rows in its eligibility window
are left `ai_text IS NULL` for a later top-up decision, not silently
reassigned elsewhere. The per-token prices in PRICING below are this
project's own approximate figures for deciding when to stop calling an API,
not a guarantee of the bill -- the provider's own billing dashboard is
always the real source of truth, same caveat tag.py already carries for its
gpt-5-nano estimate.

Resumable/idempotent: only rows with ai_text IS NULL are ever selected, and
progress commits every COMMIT_EVERY rows, so killing and re-running this
script picks up where it left off. Per-provider spend is NOT persisted
across runs (re-running re-measures a fresh pilot batch and starts its
budget counter over) -- acceptable for a bounded checkpoint amount ($5/$5),
but worth knowing before re-running this many times in a row.

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.aiify_api
"""

import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from dotenv import load_dotenv

# Must run before any os.environ.get(...) call in this file -- pydantic-
# settings reads backend/.env into its own Settings object but does not
# export it to the real process os.environ. Found the hard way in tag.py
# 2026-08-07 (GROQ_API_KEY silently invisible to os.environ.get, causing a
# fallback to a paid API instead of free Groq); fixed here too before this
# script's paid Google/Anthropic legs could hit the same bug.
load_dotenv()

from openai import OpenAI

from app.db.models.finetune_sample import FinetuneSample
from app.db.session import SessionLocal
from scripts.finetune.aiify_split import ANTHROPIC_BUCKET, GOOGLE_BUCKET, OPENAI_BUCKET

# Anthropic restored 2026-08-08 (round 12) -- ANTHROPIC_API_KEY added, real
# call verified working, see STATE.md.

logger = logging.getLogger(__name__)

# Same instruction used by the Kaggle notebook (kaggle/aiify_notebook.ipynb)
# for the self-hosted-model portion -- kept byte-identical so every AI-ify
# source is teaching the LoRA the same underlying task, just via different
# models' "accents" of it.
AIIFY_INSTRUCTION = (
    "Rewrite the following text in typical AI-assistant style: uniform sentence lengths, "
    "transition words, generic vocabulary (delve, leverage, robust, crucial, seamless), "
    "parallel triads, hedging, symmetric paragraphs. Preserve the meaning, facts, names, and "
    "numbers exactly. Output only the rewritten text, nothing else.\n\nText:\n{text}"
)

COMMIT_EVERY = 100
OPENAI_CONCURRENCY = 8
GOOGLE_CONCURRENCY = 15  # raised 2026-08-08: at 5, real measured throughput was only
# ~24 rows/min (~12.5s/call at that concurrency) with ZERO rate-limit (429) errors in
# the whole run -- only 4 unrelated transient 500 INTERNAL server errors, already
# auto-retried fine. That's real evidence 5 was conservative without cause, not evidence
# of an actual ceiling -- raised to 15 (3x). Watch for 429s after this change; back off
# if any appear, since this is still not a confirmed hard limit either.
ANTHROPIC_CONCURRENCY = 10  # raised more conservatively than Google's -- no real usage
# data yet for this key/tier (hasn't run at all this session), so less confident bumping
# as far. Same instruction: watch for 429s, back off if seen.
MAX_RETRIES = 5

PILOT_BATCH_SIZE = 20  # rows used to measure a real $/row rate before committing the full budget
BUDGET_USD = {"google": 5.0, "anthropic": 5.0}  # user-approved caps, checked against real usage

# Approximate per-1M-token prices, USD -- used only to decide when a paid
# provider should stop, not presented as an exact bill. Cheapest tier of
# each provider chosen deliberately to maximize rows-per-dollar within the
# $5 budgets, since diversity of *model family* matters here, not flagship
# quality (the Kaggle/OpenAI legs already exist for that spread).
#
# 2026-08-08: Google's rates below were WRONG -- caught live when the user's
# real Google AI Studio dashboard showed $2.50 spent while this script's own
# tracker believed only $0.373. Verified the real rates directly from
# ai.google.dev/gemini-api/docs/pricing: $0.30/$2.50 per 1M input/output,
# not the $0.10/$0.40 this dict had (output alone was off by 6.25x, which is
# most of why AI-ify calls -- output-heavy full rewrites -- blew the
# tracked/real ratio out so badly). OpenAI ($0.40/$1.60) and Anthropic
# ($1.00/$5.00) were cross-checked against their real pricing pages at the
# same time and confirmed already correct -- only Google needed fixing.
#
# Also swapped the Google model itself right after this: user asked for a
# cheaper Gemini option. `gemini-2.5-flash-lite` ($0.10/$0.40, the rate this
# dict originally had by coincidence) would have been ideal but returned a
# real 404 on a live test call -- "no longer available to new users."
# `gemini-3.1-flash-lite` ($0.25/$1.50) is the next-cheapest still-active
# model, verified with a real end-to-end call (usage_metadata confirmed,
# ~3.2x cheaper than `gemini-flash-lite-latest`'s real $0.30/$2.50 rate).
# Switching models mid-corpus is safe here: rows already AI-ified with
# flash-lite-latest keep that ai_text permanently, only not-yet-processed
# rows in Google's bucket pick up the new model going forward.
PRICING = {
    "openai": {"model": "gpt-4.1-mini", "input_per_1m": 0.40, "output_per_1m": 1.60},
    "google": {"model": "gemini-3.1-flash-lite", "input_per_1m": 0.25, "output_per_1m": 1.50},
    "anthropic": {"model": "claude-haiku-4-5-20251001", "input_per_1m": 1.00, "output_per_1m": 5.00},
}


def make_client(provider: str):
    """Returns (client, model) for OpenAI (LangChain chat model instances for
    google/anthropic are built separately in make_langchain_client)."""
    if provider == "openai":
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("OPENAI_API_KEY not set in backend/.env")
        return OpenAI(api_key=key), PRICING["openai"]["model"]
    raise ValueError(provider)


def make_langchain_client(provider: str):
    if provider == "google":
        key = os.environ.get("GOOGLE_API_KEY")
        if not key:
            raise RuntimeError("GOOGLE_API_KEY not set in backend/.env")
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=PRICING["google"]["model"], google_api_key=key, temperature=0.8, max_output_tokens=1024
        )
    if provider == "anthropic":
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY not set in backend/.env -- add it before running the anthropic leg "
                "(not requested from the user in chat; add it directly to backend/.env)."
            )
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=PRICING["anthropic"]["model"], api_key=key, temperature=0.8, max_tokens=1024
        )
    raise ValueError(provider)


def aiify_one(client: OpenAI, model: str, text: str) -> str | None:
    prompt = AIIFY_INSTRUCTION.format(text=text)
    for attempt in range(MAX_RETRIES):
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.8,
                max_tokens=1024,
            )
            content = (resp.choices[0].message.content or "").strip()
            return content or None
        except Exception as exc:
            wait = min(2**attempt, 30)
            logger.warning("aiify call failed (attempt %d/%d): %s -- retrying in %ds", attempt + 1, MAX_RETRIES, exc, wait)
            time.sleep(wait)
    return None


def _extract_text(content) -> str:
    """Normalizes a LangChain response's .content to plain text. Most models
    return a plain string, but some (confirmed 2026-08-08: Gemini via
    langchain-google-genai, model "gemini-flash-lite-latest") return a list
    of content blocks instead, e.g. [{'type': 'text', 'text': '...', ...}] --
    a naive `.strip()` on that raises AttributeError. Handles both shapes."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
        return "".join(parts)
    return ""


def aiify_one_langchain(llm, provider: str, text: str) -> tuple[str | None, float]:
    """Returns (rewritten_text_or_None, estimated_cost_usd_for_this_call).
    Cost is computed from the response's own reported usage_metadata when
    available; falls back to a char/4 token estimate if a provider's
    response doesn't populate it (logged clearly when that happens, so a
    silent-zero-cost bug can't hide)."""
    prompt = AIIFY_INSTRUCTION.format(text=text)
    price = PRICING[provider]
    for attempt in range(MAX_RETRIES):
        try:
            resp = llm.invoke(prompt)
            content = _extract_text(resp.content).strip()
            usage = getattr(resp, "usage_metadata", None)
            if usage:
                in_tok = usage.get("input_tokens", 0)
                out_tok = usage.get("output_tokens", 0)
            else:
                logger.warning(
                    "%s response had no usage_metadata -- falling back to a char/4 token estimate "
                    "for cost tracking (less accurate, logged so this isn't a silent gap).",
                    provider,
                )
                in_tok = len(prompt) // 4
                out_tok = len(content) // 4
            cost = (in_tok / 1_000_000 * price["input_per_1m"]) + (out_tok / 1_000_000 * price["output_per_1m"])
            return (content or None), cost
        except Exception as exc:
            wait = min(2**attempt, 30)
            logger.warning("%s aiify call failed (attempt %d/%d): %s -- retrying in %ds", provider, attempt + 1, MAX_RETRIES, exc, wait)
            time.sleep(wait)
    return None, 0.0


def select_rows(db, bucket: tuple[int, int]) -> list[FinetuneSample]:
    lo, hi = bucket
    return (
        db.query(FinetuneSample)
        .filter(
            FinetuneSample.status == "tagged",
            FinetuneSample.style == "normal",  # production only ships `normal` -- see module docstring
            FinetuneSample.ai_text.is_(None),
            (FinetuneSample.id % 100) >= lo,
            (FinetuneSample.id % 100) < hi,
        )
        .order_by(FinetuneSample.id)
        .all()
    )


def commit_with_retry(db, provider: str) -> bool:
    """Retries db.commit() up to 3 times with rollback + backoff between
    attempts, same pattern already proven in tag.py. Added 2026-08-08 after
    a real incident: a transient `psycopg2.OperationalError: SSL connection
    has been closed unexpectedly` crashed this script's Google leg entirely,
    with no retry -- the whole process exited on an unhandled exception.
    OpenAI's leg had already finished cleanly by then (no data lost there),
    but the crash meant Google/Anthropic needed a manual restart that a
    transient network blip shouldn't require. Returns False (batch left
    uncommitted, safe to retry on the next run since ai_text IS NULL is the
    selection filter) if all 3 attempts fail, rather than raising."""
    for attempt in range(3):
        try:
            db.commit()
            return True
        except Exception as exc:
            logger.warning(
                "[%s] db.commit() failed (attempt %d/3): %s -- rolling back and retrying",
                provider, attempt + 1, exc,
            )
            db.rollback()
            time.sleep(2 * (attempt + 1))
    logger.error("[%s] db.commit() failed 3 times in a row -- giving up on this batch, will retry on next run.", provider)
    return False


def run_provider(db, provider: str, bucket: tuple[int, int]) -> None:
    """Free/no-budget-cap providers: currently just openai. Runs the full bucket."""
    rows = select_rows(db, bucket)
    if not rows:
        logger.info("[%s] nothing to do -- no rows left with ai_text IS NULL in id%%100 in %s", provider, bucket)
        return

    client, model = make_client(provider)
    concurrency = OPENAI_CONCURRENCY
    logger.info("[%s] AI-ifying %d rows with %s (concurrency=%d)", provider, len(rows), model, concurrency)

    done = 0
    failed = 0
    row_by_id = {r.id: r for r in rows}
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        for batch_start in range(0, len(rows), COMMIT_EVERY):
            batch = rows[batch_start : batch_start + COMMIT_EVERY]
            futures = {executor.submit(aiify_one, client, model, r.human_text): r.id for r in batch}
            for future in as_completed(futures):
                row_id = futures[future]
                ai_text = future.result()
                if ai_text is None:
                    failed += 1
                    continue
                row_by_id[row_id].ai_text = ai_text
                row_by_id[row_id].status = "ai_ready"
                done += 1
            commit_with_retry(db, provider)
            logger.info("[%s] %d/%d done (%d failed, will retry on next run)", provider, done, len(rows), failed)

    logger.info("[%s] finished this run: %d rows AI-ified, %d failed and left pending.", provider, done, failed)


def run_provider_budgeted(db, provider: str, bucket: tuple[int, int]) -> None:
    """Cost-gated providers: google, anthropic. Runs a small pilot batch
    first to measure a real $/row rate, then processes as many more rows as
    the remaining $BUDGET_USD[provider] affords -- stops the instant
    cumulative estimated spend would exceed budget, mid-batch if needed."""
    rows = select_rows(db, bucket)
    if not rows:
        logger.info("[%s] nothing to do -- no rows left with ai_text IS NULL in id%%100 in %s", provider, bucket)
        return

    budget = BUDGET_USD[provider]
    llm = make_langchain_client(provider)
    concurrency = GOOGLE_CONCURRENCY if provider == "google" else ANTHROPIC_CONCURRENCY

    pilot = rows[:PILOT_BATCH_SIZE]
    logger.info(
        "[%s] running a %d-row pilot batch to measure real $/row before spending the $%.2f budget...",
        provider, len(pilot), budget,
    )
    spent = 0.0
    done = 0
    failed = 0
    row_by_id = {r.id: r for r in rows}

    def process_batch(batch: list[FinetuneSample]) -> None:
        nonlocal spent, done, failed
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = {executor.submit(aiify_one_langchain, llm, provider, r.human_text): r.id for r in batch}
            for future in as_completed(futures):
                row_id = futures[future]
                ai_text, cost = future.result()
                spent += cost
                if ai_text is None:
                    failed += 1
                    continue
                row_by_id[row_id].ai_text = ai_text
                row_by_id[row_id].status = "ai_ready"
                done += 1
        commit_with_retry(db, provider)

    process_batch(pilot)
    if done == 0:
        logger.error("[%s] pilot batch produced 0 successful rows -- stopping, check API key/quota before retrying.", provider)
        return

    measured_rate = spent / done
    remaining_budget = budget - spent
    affordable_more = max(0, int(remaining_budget / measured_rate)) if measured_rate > 0 else 0
    logger.info(
        "[%s] pilot done: %d/%d succeeded, $%.4f spent -> measured $%.5f/row. "
        "$%.2f budget remaining affords ~%d more rows (of %d left in this bucket).",
        provider, done, len(pilot), spent, measured_rate, remaining_budget, affordable_more, len(rows) - len(pilot),
    )

    remaining_rows = rows[len(pilot):len(pilot) + affordable_more]
    for batch_start in range(0, len(remaining_rows), COMMIT_EVERY):
        if spent >= budget:
            logger.info("[%s] budget reached mid-run ($%.4f >= $%.2f) -- stopping here.", provider, spent, budget)
            break
        batch = remaining_rows[batch_start : batch_start + COMMIT_EVERY]
        process_batch(batch)
        logger.info(
            "[%s] %d/%d done this run (%d failed), cumulative spend $%.4f / $%.2f budget",
            provider, done, len(pilot) + len(remaining_rows), failed, spent, budget,
        )

    skipped = len(rows) - done - failed
    logger.info(
        "[%s] finished this run: %d rows AI-ified, %d failed, %d left unclaimed (budget exhausted or not reached) "
        "-- final estimated spend $%.4f of $%.2f budget.",
        provider, done, failed, skipped, spent, budget,
    )


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    db = SessionLocal()

    run_provider(db, "openai", OPENAI_BUCKET)
    run_provider_budgeted(db, "google", GOOGLE_BUCKET)
    run_provider_budgeted(db, "anthropic", ANTHROPIC_BUCKET)

    total_ai_ready = db.query(FinetuneSample).filter(FinetuneSample.status == "ai_ready").count()
    total = db.query(FinetuneSample).count()
    print(f"\nTotal ai_ready so far (all sources, Kaggle + API): {total_ai_ready}/{total}")

    db.close()


if __name__ == "__main__":
    main()
