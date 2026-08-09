"""Pre-training corpus check (Phase 2, Humaniser LoRA fine-tune).

Runs BEFORE the Modal training spend, not after -- distinct from Step 7's
eval_detector.py, which needs a trained LoRA and only scores 5 hand-picked
benchmark inputs. This script asks a cheaper, earlier question: do our own
`human_text` / `ai_text` training pairs already show a real, measurable gap
in the two signals AI detectors actually use (perplexity, burstiness), or is
the training signal weaker than the system prompt's qualitative instructions
("vary sentence length hard") assume?

Samples N random ai_ready rows straight from finetune_samples, scores both
sides of each pair with the same GPT-2 reference-LM proxy eval_detector.py
uses (small, CPU-only, not the model being evaluated -- not circular), and
reports the aggregate mean perplexity/burstiness gap. Pure local compute, no
API calls, $0, a few minutes for a few hundred rows.

Reading the result:
  - human_text should score HIGHER perplexity and HIGHER burstiness on
    average than ai_text, matching the classic "AI text is smoother /
    more uniform" detector signature.
  - If the gap is small or the wrong direction, that's a warning the
    training pairs may not teach the intended shift as strongly as hoped --
    worth knowing before spending on Modal, not after.

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.corpus_signal_check [--sample-size 300]
"""

import argparse
import json
import logging
import random
import statistics
from pathlib import Path

from app.db.models.finetune_sample import FinetuneSample
from app.db.session import SessionLocal
from scripts.finetune.eval_detector import PerplexityScorer

logger = logging.getLogger(__name__)

HERE = Path(__file__).parent
OUT_PATH = HERE / "corpus_signal_check_results.json"

DEFAULT_SAMPLE_SIZE = 300


# "ai_ready" is the status right after Step 3; export.py (Step 4) advances it
# to "exported" once train/eval split is written. This corpus already went
# through export.py by the time this check is run, so both statuses count --
# what matters here is ai_text being populated, not which pipeline stage the
# row is administratively parked at.
PAIRED_STATUSES = ("ai_ready", "exported")


def sample_rows(db, sample_size: int) -> list[FinetuneSample]:
    total = (
        db.query(FinetuneSample)
        .filter(FinetuneSample.status.in_(PAIRED_STATUSES), FinetuneSample.ai_text.isnot(None))
        .count()
    )
    if total == 0:
        return []
    n = min(sample_size, total)
    # Random OFFSET sampling is fine at this scale (thousands of rows, one-off
    # analysis script) -- no need for a fancier TABLESAMPLE query here.
    offsets = random.sample(range(total), n)
    rows = []
    for off in offsets:
        row = (
            db.query(FinetuneSample)
            .filter(FinetuneSample.status.in_(PAIRED_STATUSES), FinetuneSample.ai_text.isnot(None))
            .order_by(FinetuneSample.id)
            .offset(off)
            .limit(1)
            .first()
        )
        if row is not None:
            rows.append(row)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-size", type=int, default=DEFAULT_SAMPLE_SIZE)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    db = SessionLocal()
    logger.info("Sampling up to %d ai_ready rows...", args.sample_size)
    rows = sample_rows(db, args.sample_size)
    if not rows:
        logger.error("No paired rows found (status in %s with ai_text set) -- run Step 3 (AI-ify) first.", PAIRED_STATUSES)
        db.close()
        return
    logger.info("Sampled %d rows. Loading GPT-2 reference LM...", len(rows))

    scorer = PerplexityScorer()

    human_ppl, human_burst = [], []
    ai_ppl, ai_burst = [], []
    per_row = []

    for i, row in enumerate(rows, 1):
        h = scorer.score(row.human_text)
        a = scorer.score(row.ai_text)
        if h["perplexity"] is not None:
            human_ppl.append(h["perplexity"])
            human_burst.append(h["burstiness"])
        if a["perplexity"] is not None:
            ai_ppl.append(a["perplexity"])
            ai_burst.append(a["burstiness"])
        per_row.append({"id": row.id, "style": row.style, "human": h, "ai": a})
        if i % 50 == 0:
            logger.info("  %d/%d rows scored...", i, len(rows))

    # Scoring is CPU/GPT-2-bound and takes minutes; Neon's idle-connection
    # timeout can drop the session by the time we're done (same class of
    # issue aiify_api.py hit). All rows are already in memory at this point,
    # so a close failure here must not lose the results -- close best-effort.
    try:
        db.close()
    except Exception:
        logger.warning("DB close failed (connection likely idled out) -- harmless, all rows already in memory.")

    def summarize(values: list[float]) -> dict:
        if not values:
            return {"mean": None, "median": None, "n": 0}
        return {
            "mean": round(statistics.mean(values), 2),
            "median": round(statistics.median(values), 2),
            "n": len(values),
        }

    summary = {
        "sample_size": len(rows),
        "human_perplexity": summarize(human_ppl),
        "ai_perplexity": summarize(ai_ppl),
        "human_burstiness": summarize(human_burst),
        "ai_burstiness": summarize(ai_burst),
    }

    OUT_PATH.write_text(json.dumps({"summary": summary, "rows": per_row}, indent=2))

    print("\n" + "=" * 78)
    print(f"CORPUS SIGNAL CHECK -- {len(rows)} ai_ready pairs, GPT-2 reference LM")
    print("=" * 78)
    print(f"{'signal':<22} {'human mean':>12} {'ai mean':>12} {'gap':>10}")
    for label, hkey, akey in [
        ("perplexity", "human_perplexity", "ai_perplexity"),
        ("burstiness", "human_burstiness", "ai_burstiness"),
    ]:
        hm = summary[hkey]["mean"]
        am = summary[akey]["mean"]
        gap = round(hm - am, 2) if hm is not None and am is not None else None
        hm_s = f"{hm:.2f}" if hm is not None else "n/a"
        am_s = f"{am:.2f}" if am is not None else "n/a"
        gap_s = f"{gap:+.2f}" if gap is not None else "n/a"
        print(f"{label:<22} {hm_s:>12} {am_s:>12} {gap_s:>10}")

    print(f"\nFull per-row results written to {OUT_PATH}")
    print(
        "\nInterpretation: positive gap on both rows (human > ai) means the corpus already "
        "shows the classic 'AI is smoother/more uniform' signature the training is meant to "
        "teach the model to reverse. A small or negative gap means the AI-ify outputs may be "
        "too close to human already on these two signals -- weaker training signal than hoped, "
        "worth knowing before the Modal training spend, not after."
    )


if __name__ == "__main__":
    main()
