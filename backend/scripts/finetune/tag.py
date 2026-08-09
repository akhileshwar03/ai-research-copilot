"""Step 2 — style tagging (Phase 2, Humaniser LoRA fine-tune).

Assigns each `finetune_samples` row a style: normal / clear_structured /
simple_formal. Local regex heuristics run first (free). To validate them, a
random 200-row subset is *also* tagged with `gpt-5-nano` and compared against
the heuristic label; if agreement is high, the heuristic labels are trusted
for the full corpus. If agreement is low, falls back to tagging the full
corpus with `gpt-5-nano` — a cost estimate is printed first, and the run only
pauses for explicit go-ahead if that estimate exceeds $3 (per-spend-under-$3
is pre-approved).

Idempotent: only rows with `style IS NULL` are processed, so re-running after
a partial run (or after adding more Step-1 sources) just tags the new rows.

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.tag
"""

import logging
import os
import random
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from dotenv import load_dotenv

# Must run before any os.environ.get(...) call below. pydantic-settings
# (app.core.config.Settings) reads backend/.env into its own object but does
# NOT export those values into the process's real os.environ -- confirmed
# the hard way 2026-08-07: GROQ_API_KEY was set in .env, Settings() could
# see it, but this script's own `os.environ.get("GROQ_API_KEY")` returned
# None, silently falling through to the paid gpt-5-nano branch instead of
# free Groq and burning real (small, ~280 calls, since caught quickly)
# OpenAI spend before being caught and killed. load_dotenv() actually
# populates os.environ from the same .env file so the check below works.
load_dotenv()

from app.core.config import get_settings
from app.db.models.finetune_sample import FinetuneSample
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

STYLES = ["normal", "clear_structured", "simple_formal"]

SPOT_CHECK_SIZE = 200
AGREEMENT_THRESHOLD = 0.65  # below this, fall back to nano for the full corpus
COST_GATE_USD = 3.0
NANO_CONCURRENCY = 15  # bounded thread pool -- sequential calls at ~3-4s each made the
# full-corpus fallback a ~20-hour run; concurrency cuts that dramatically. Was 20, which
# blew through the org's 500 RPM cap on gpt-5-nano (confirmed: 56,430 HTTP 429s logged
# across the first full-corpus run) -- LangChain's client-level retry-on-429 amplifies
# the overload (each retry re-submits, competing with the next batch), and the *old*
# nano_style_safe() silently defaulted failed rows to "normal" after exhausting retries.
# That meant 18,553 of 20,000 rows in the first "successful" run were NEVER actually
# nano-classified -- they were silent failures posing as a real 93%-normal result. See
# STATE.md for the full incident writeup and the corpus reset this required.
#
# 2026-08-07: considered raising this to 30 for the paid-nano fallback to
# speed up a live run, on the theory that 15 was leaving headroom under the
# 500 RPM cap. Reverted before applying it -- the comment above is exactly
# the counter-evidence: concurrency=20 (barely above 15, well below 30)
# already blew through that cap once, badly, with a silent-failure mode that
# corrupted the tagging output. Speculating a new "safe" number from a
# latency estimate isn't good enough given that specific documented history.
# Kept at the already-proven-safe 15 for the paid-nano fallback.
FALLBACK_CONCURRENCY = 15
COMMIT_EVERY = 200
NANO_MAX_RETRIES = 8  # passed to the OpenAI client itself (exponential backoff on 429/5xx)

# Rough, labeled-as-approximate per-token estimate for gpt-5-nano (cheapest
# OpenAI tier) — used only to decide whether we're safely under the $3 gate,
# not presented as an exact bill.
EST_INPUT_COST_PER_1M = 0.05
EST_OUTPUT_COST_PER_1M = 0.40

_CONTRACTIONS = re.compile(
    r"\b(i'm|don't|can't|won't|it's|that's|you're|we're|they're|isn't|aren't|didn't|"
    r"couldn't|wouldn't|shouldn't|i've|you've|we've|i'll|you'll|we'll|let's|here's|there's)\b",
    re.IGNORECASE,
)
_STRUCTURE_MARKERS = re.compile(
    r"(table of contents|works cited|references\s*$|^\s*\d+\.\s|^\s*#{1,3}\s|"
    r"^\s*(introduction|conclusion|summary|background|methodology)\s*$)",
    re.IGNORECASE | re.MULTILINE,
)
_FORMAL_CONNECTIVES = re.compile(
    r"\b(therefore|furthermore|accordingly|consequently|thus|hence|pursuant|hereby|hereinafter)\b",
    re.IGNORECASE,
)
_CASUAL_FIRST_PERSON = re.compile(r"\b(i|i'm|i've|i'll|my|me)\b", re.IGNORECASE)

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def heuristic_style(text: str) -> str:
    words = text.split()
    n = len(words) or 1
    contraction_rate = len(_CONTRACTIONS.findall(text)) / n
    structure_hits = len(_STRUCTURE_MARKERS.findall(text))
    formal_hits = len(_FORMAL_CONNECTIVES.findall(text))
    casual_rate = len(_CASUAL_FIRST_PERSON.findall(text)) / n
    sentences = [s for s in _SENTENCE_SPLIT.split(text) if s.strip()]
    avg_sentence_len = n / max(len(sentences), 1)

    if structure_hits >= 2 or (avg_sentence_len > 22 and formal_hits >= 2):
        return "clear_structured"
    if contraction_rate < 0.003 and formal_hits >= 1 and casual_rate < 0.02:
        return "simple_formal"
    return "normal"


_NANO_PROMPT = """Classify this text's writing register as exactly one word: normal, \
clear_structured, or simple_formal.

- normal: casual, blog-like, conversational prose (may be first-person/narrative)
- clear_structured: reports, essays, or writing with clear sections/headings/structure
- simple_formal: professional/business writing — no contractions, measured tone

Text:
{text}

Answer with exactly one word, nothing else."""


def nano_style(llm, text: str) -> str:
    response = llm.invoke([("human", _NANO_PROMPT.format(text=text[:1500]))])
    answer = response.content.strip().lower()
    for style in STYLES:
        if style in answer:
            return style
    return "normal"


NANO_CURSOR_FILE = __import__("pathlib").Path(__file__).parent / ".tag_nano_cursor.json"


def load_nano_cursor() -> set[int]:
    if NANO_CURSOR_FILE.exists():
        import json

        return set(json.loads(NANO_CURSOR_FILE.read_text()))
    return set()


def save_nano_cursor(ids: set[int]) -> None:
    import json

    NANO_CURSOR_FILE.write_text(json.dumps(sorted(ids)))


def nano_style_safe(nano, text: str) -> str | None:
    """Returns None on failure (network error, rate limit exhausted after the
    client's own retries) rather than a guessed style -- a row that fails
    here is left untouched and NOT added to the cursor, so it's simply
    retried on the next invocation instead of silently mislabeled."""
    try:
        return nano_style(nano, text)
    except Exception as exc:
        logger.warning("nano_style call failed (will retry on a later run): %s", exc)
        return None


def tag_rows_concurrently(nano, rows: list[FinetuneSample], db) -> None:
    """Nano-tag `rows` with a bounded thread pool, committing (and saving a
    row-id cursor) every COMMIT_EVERY completions -- a kill mid-run loses at
    most one batch, and re-running skips ids already in the cursor.

    Submits in fixed-size batches rather than handing the whole `pending`
    list to the executor at once. At full-corpus scale (~30k rows),
    submitting everything up front meant the main thread spent minutes
    fighting the live worker threads for the executor's internal queue lock
    just to finish the submit loop -- workers were already making real API
    calls in the background (visible in the log as "200 OK" lines), but the
    main thread never reached `as_completed()` to consume a single result,
    so nothing was ever committed. Batching keeps each submit loop tiny.
    """
    cursor_ids = load_nano_cursor()
    row_by_id = {r.id: r for r in rows}
    pending = [r for r in rows if r.id not in cursor_ids]
    logger.info(
        "Nano-tagging %d rows (%d already done from a prior run, concurrency=%d)...",
        len(pending),
        len(rows) - len(pending),
        NANO_CONCURRENCY,
    )

    done_count = 0
    failed_count = 0
    batch_size = COMMIT_EVERY
    with ThreadPoolExecutor(max_workers=NANO_CONCURRENCY) as executor:
        for batch_start in range(0, len(pending), batch_size):
            batch = pending[batch_start : batch_start + batch_size]
            futures = {executor.submit(nano_style_safe, nano, r.human_text): r.id for r in batch}
            for future in as_completed(futures):
                row_id = futures[future]
                style = future.result()
                if style is None:
                    failed_count += 1
                    continue  # left untouched, not cursored -- retried on the next run
                row_by_id[row_id].style = style
                cursor_ids.add(row_id)
                done_count += 1
            # Retry the commit itself -- a transient SSL/network drop killed
            # a full run here once already (confirmed: crashed on
            # `psycopg2.OperationalError: SSL connection has been closed
            # unexpectedly` before its first checkpoint, nothing lost since
            # nothing had committed yet, but wasted the whole run). A failed
            # commit leaves the session's transaction aborted, so it must be
            # rolled back before the retry attempt, not just re-tried as-is.
            for attempt in range(3):
                try:
                    db.commit()
                    break
                except Exception as exc:
                    logger.warning("db.commit() failed (attempt %d/3): %s -- rolling back and retrying", attempt + 1, exc)
                    db.rollback()
                    time.sleep(2 * (attempt + 1))
            else:
                logger.error("db.commit() failed 3 times in a row -- giving up on this batch, rows stay uncursored.")
                continue
            save_nano_cursor(cursor_ids)
            logger.info(
                "Nano-tagged %d/%d this run (%d failed, will retry)", done_count, len(pending), failed_count
            )
    logger.info(
        "Nano tagging complete: %d rows processed this run, %d failed and left pending for a re-run.",
        done_count,
        failed_count,
    )


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    db = SessionLocal()

    # Step A: heuristic-tag anything not yet touched at all.
    untagged = db.query(FinetuneSample).filter(FinetuneSample.status == "collected").all()
    if untagged:
        logger.info("Tagging %d rows with local heuristics...", len(untagged))
        # Batched commits (not one commit for the whole set) -- a single
        # 11,500-row commit over a remote Neon connection sat for minutes with
        # no visible progress and no clean way to tell "slow" from "hung"
        # (confirmed the hard way: mid-run, mistook it for a stale orphaned
        # transaction and killed it -- no data lost since nothing had
        # committed yet, but it wasted a run). Committing in batches gives
        # real progress signal and means a kill/crash loses at most one batch.
        for idx, row in enumerate(untagged, start=1):
            row.style = heuristic_style(row.human_text)
            row.status = "tagged"
            if idx % COMMIT_EVERY == 0:
                db.commit()
                logger.info("Heuristic-tagged %d/%d so far...", idx, len(untagged))
        db.commit()
        logger.info("Heuristic tagging complete.")

    tagged_rows = db.query(FinetuneSample).filter(FinetuneSample.status == "tagged").all()
    if not tagged_rows:
        logger.info("Nothing pending validation — all rows already finalized.")
        db.close()
        return

    settings = get_settings()
    from langchain_openai import ChatOpenAI

    # 2026-08-07: the spot-check pass and the full-corpus fallback pass now
    # deliberately use DIFFERENT clients, after hitting a real problem this
    # session. They used to share one `nano` client picked once (Groq if
    # GROQ_API_KEY set, else paid nano) -- fine for the 200-row spot check
    # (Groq's free tier handles that, just slowly under its 6,000 TPM limit),
    # but disastrous for the *full-corpus* fallback: at that same throttled
    # rate, 24,000 rows would take ~30 hours. The paid `gpt-5-nano` client
    # doesn't have this problem (OpenAI's org rate limits are far higher) and
    # costs under $1 for this corpus size -- see the original attempt (before
    # this checkpoint), which used paid nano directly for $3-6 with no
    # rate-limit issues at all. So: spot-check stays on free Groq (cheap
    # accuracy signal), but the full fallback -- if triggered -- always uses
    # paid nano, never Groq, regardless of which key is set for the spot
    # check.
    groq_key = os.environ.get("GROQ_API_KEY")
    if groq_key:
        # Concurrency of 15 was tuned for OpenAI's org-level 500 RPM cap --
        # pointed at Groq's much stricter free tier it caused a real
        # thundering herd (confirmed: 196 HTTP 429s in ~35 seconds, only
        # 35/200 spot-check calls actually succeeded, first live run of
        # this swap). Dropped to 3 for Groq specifically.
        global NANO_CONCURRENCY
        NANO_CONCURRENCY = 3
        logger.info("Using Groq (llama-3.1-8b-instant, free tier) for the spot-check only.")
        spot_check_llm = ChatOpenAI(
            api_key=groq_key,
            base_url="https://api.groq.com/openai/v1",
            model="llama-3.1-8b-instant",
            temperature=0,
            max_retries=NANO_MAX_RETRIES,
        )
    else:
        logger.info("GROQ_API_KEY not set -- using paid %s for the spot-check too.", settings.humanizer_classify_model)
        spot_check_llm = None  # set below, same as fallback_llm

    fallback_llm = ChatOpenAI(
        api_key=settings.openai_api_key,
        model=settings.humanizer_classify_model,
        temperature=0,
        max_retries=NANO_MAX_RETRIES,
    )
    if spot_check_llm is None:
        spot_check_llm = fallback_llm

    cursor_ids = load_nano_cursor()
    if cursor_ids:
        # A previous run already decided to fall back to nano and got partway
        # through -- resume it directly (always paid nano), no need to
        # re-run the spot check.
        #
        # 2026-08-07: found a second concurrency bug right before using this
        # path -- NANO_CONCURRENCY was left at whatever the groq_key branch
        # above set it to (3, tuned for Groq's spot-check rate limit), since
        # this resume branch never explicitly reset it the way the "just
        # decided to fall back" branch below does. A resumed run would have
        # silently run 5x slower than intended. Set explicitly here too.
        global NANO_CONCURRENCY
        NANO_CONCURRENCY = FALLBACK_CONCURRENCY
        logger.info(
            "Resuming an in-progress nano fallback (%d rows already done), concurrency=%d.",
            len(cursor_ids), NANO_CONCURRENCY,
        )
        tag_rows_concurrently(fallback_llm, tagged_rows, db)
    else:
        spot_check_rows = random.sample(tagged_rows, min(SPOT_CHECK_SIZE, len(tagged_rows)))
        agree = 0
        answered = 0
        # 2026-08-07 bug fix: this used to divide by len(spot_check_rows) --
        # every row that failed (rate-limit exhausted retries, returns None
        # from nano_style_safe) silently counted as a *disagreement*
        # (None == "normal" is False), not as "no data". Confirmed the hard
        # way: a Groq TPM rate-limit storm produced a bogus 9.0% agreement
        # reading that would have triggered an unnecessary ~24,000-row paid/
        # rate-limited fallback (at the observed throttled rate, tens of
        # hours) based on failure noise, not a real accuracy measurement.
        # Now agreement is computed only over rows that actually got
        # classified, with the failure count logged separately so a high
        # failure rate is visible rather than silently poisoning the metric.
        with ThreadPoolExecutor(max_workers=NANO_CONCURRENCY) as executor:
            futures = {executor.submit(nano_style_safe, spot_check_llm, r.human_text): r.style for r in spot_check_rows}
            for future in as_completed(futures):
                result = future.result()
                if result is None:
                    continue
                answered += 1
                if result == futures[future]:
                    agree += 1
        agreement = (agree / answered) if answered > 0 else 0.0
        logger.info(
            "Heuristic/nano agreement: %.1f%% (%d/%d answered out of %d sampled -- %d failed/rate-limited "
            "and excluded from this metric, not counted as disagreement)",
            agreement * 100, agree, answered, len(spot_check_rows), len(spot_check_rows) - answered,
        )
        if answered < len(spot_check_rows) * 0.5:
            logger.warning(
                "Only %d/%d spot-check calls succeeded -- more than half failed (likely rate-limiting). "
                "This agreement reading is based on a smaller, possibly less representative sample than "
                "intended. Consider re-running once the rate limit window clears if this number looks off.",
                answered, len(spot_check_rows),
            )

        if agreement < AGREEMENT_THRESHOLD:
            logger.warning(
                "Agreement below %.0f%% threshold — falling back to gpt-5-nano for the full corpus.",
                AGREEMENT_THRESHOLD * 100,
            )
            avg_chars = sum(len(r.human_text) for r in tagged_rows) / len(tagged_rows)
            est_input_tokens = (avg_chars / 4 + 60) * len(tagged_rows)
            est_output_tokens = 3 * len(tagged_rows)
            est_cost = (est_input_tokens / 1_000_000 * EST_INPUT_COST_PER_1M) + (
                est_output_tokens / 1_000_000 * EST_OUTPUT_COST_PER_1M
            )
            print(f"\nEstimated cost to re-tag all {len(tagged_rows)} rows with gpt-5-nano: ~${est_cost:.2f} (approximate)")
            if est_cost > COST_GATE_USD:
                print(f"This exceeds the ${COST_GATE_USD:.2f} gate — STOPPING. Re-run with explicit go-ahead to proceed.")
                db.close()
                return
            print(f"Under the ${COST_GATE_USD:.2f} gate (pre-approved) — proceeding automatically.")
            save_nano_cursor(set())  # mark that a fallback run has started, for resumability
            # Deliberately fallback_llm (paid nano), never spot_check_llm --
            # see the comment above where both clients are built. No second
            # `global` needed here -- the one above (inside the groq_key
            # branch) already makes NANO_CONCURRENCY global for this whole
            # function; a second `global` statement after the name's already
            # been used earlier in the function is a SyntaxError in Python,
            # not just redundant.
            NANO_CONCURRENCY = FALLBACK_CONCURRENCY  # back to the OpenAI-tuned concurrency, not Groq's 3
            tag_rows_concurrently(fallback_llm, tagged_rows, db)
        else:
            print(f"\nHeuristic labels trusted (agreement {agreement * 100:.1f}% >= {AGREEMENT_THRESHOLD * 100:.0f}%).")

    # ---- rebalance report ----
    print("\n" + "=" * 60)
    print("STYLE REBALANCE REPORT")
    print("=" * 60)
    total = db.query(FinetuneSample).count()
    for style in STYLES:
        count = db.query(FinetuneSample).filter(FinetuneSample.style == style).count()
        print(
            f"  {style}: {count} ({count / total * 100:.1f}%)  [target: "
            f"{'50%' if style == 'normal' else '25%'}]"
        )
    print(f"  Total: {total}")

    db.close()


if __name__ == "__main__":
    main()
