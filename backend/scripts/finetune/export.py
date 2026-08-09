"""Step 4 — export the LoRA training set (Phase 2, Humaniser fine-tune).

Reads every `ai_ready` row from `finetune_samples` and formats it as a chat-style
training example matching exactly what Pass 2 sees in production today (same
system prompt, built from the real `app.services.humanizer.prompts` module —
not a re-typed copy, so the LoRA is trained on the identical instruction it
will be invoked with at inference time):

    system:    BASE_PROMPT + "\n\n" + STYLE_GUIDANCE[style]
    user:      ai_text        (the AI-flavored source to rewrite)
    assistant: human_text     (the genuine human-written target)

Exported as-is, no rebalancing (user decision, 2026-08-04) — the corpus is
skewed 29.7% normal / 35.0% clear_structured / 35.3% simple_formal vs. the
50/25/25 target, because Step 3 (Kaggle AI-ify) was stopped early with quota
remaining. Noted in STATE.md for possible class-weighting in Step 5 training.

95/5 train/eval split, stratified by style so both splits keep the same
per-style ratios. Leakage-checked: no row id in both splits, and no exact-text
duplicate (human_text) crossing the split boundary.

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.export
"""

import json
import logging
import random
from pathlib import Path

from app.db.models.finetune_sample import FinetuneSample
from app.db.session import SessionLocal
from app.services.humanizer.prompts import BASE_PROMPT, STYLE_GUIDANCE
from scripts.finetune.collect import SOURCE_CAP

logger = logging.getLogger(__name__)

OUT_DIR = Path(__file__).parent / "data"
TRAIN_PATH = OUT_DIR / "train.jsonl"
EVAL_PATH = OUT_DIR / "eval.jsonl"
MANIFEST_PATH = OUT_DIR / "export_manifest.json"

EVAL_FRACTION = 0.05
SEED = 42


def cap_by_source(rows: list[FinetuneSample], cap: int, seed: int) -> list[FinetuneSample]:
    """Enforce SOURCE_CAP at the one point it actually matters -- what goes
    into the exported training set. `collect.py` only *labels* the cap on
    its SOURCES entries; nothing previously read that label anywhere. Found
    during a 2026-08-06 cleanup pass (SOURCE_CAP was defined, referenced only
    in comments, and enforced nowhere -- confirmed by grep). Random sample
    (not "first N") so capping doesn't bias which rows of an over-represented
    source get kept."""
    rng = random.Random(seed)
    by_source: dict[str, list[FinetuneSample]] = {}
    for r in rows:
        by_source.setdefault(r.source, []).append(r)

    capped: list[FinetuneSample] = []
    for source, source_rows in by_source.items():
        if len(source_rows) > cap:
            logger.info("Capping source=%s: %d rows -> %d (SOURCE_CAP)", source, len(source_rows), cap)
            source_rows = source_rows[:]
            rng.shuffle(source_rows)
            source_rows = source_rows[:cap]
        capped.extend(source_rows)
    return capped


def build_example(row: FinetuneSample) -> dict:
    system = BASE_PROMPT + "\n\n" + STYLE_GUIDANCE[row.style]
    return {
        "id": row.id,
        "style": row.style,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": row.ai_text},
            {"role": "assistant", "content": row.human_text},
        ],
    }


def stratified_split(rows: list[FinetuneSample], eval_fraction: float, seed: int) -> tuple[list, list]:
    """Split independently within each style so both splits keep the same
    per-style ratio as the full (deliberately unrebalanced) corpus."""
    rng = random.Random(seed)
    train, evalset = [], []
    by_style: dict[str, list] = {}
    for r in rows:
        by_style.setdefault(r.style, []).append(r)

    for style, style_rows in by_style.items():
        style_rows = style_rows[:]  # copy before shuffling
        rng.shuffle(style_rows)
        n_eval = max(1, round(len(style_rows) * eval_fraction))
        evalset.extend(style_rows[:n_eval])
        train.extend(style_rows[n_eval:])
    return train, evalset


def validate_no_leakage(train: list[FinetuneSample], evalset: list[FinetuneSample]) -> None:
    train_ids = {r.id for r in train}
    eval_ids = {r.id for r in evalset}
    id_overlap = train_ids & eval_ids
    assert not id_overlap, f"Row id leakage between train/eval: {id_overlap}"

    train_texts = {r.human_text for r in train}
    eval_texts = {r.human_text for r in evalset}
    text_overlap = train_texts & eval_texts
    assert not text_overlap, (
        f"{len(text_overlap)} exact-duplicate human_text values appear in both train and eval "
        "-- this shouldn't happen given Step 1's MinHash dedup, but checking anyway."
    )
    logger.info("Leakage check passed: no shared row ids, no shared exact-text duplicates.")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    db = SessionLocal()

    rows = db.query(FinetuneSample).filter(FinetuneSample.status == "ai_ready").all()
    if not rows:
        logger.info("No ai_ready rows to export.")
        db.close()
        return

    logger.info("%d ai_ready rows before SOURCE_CAP.", len(rows))
    rows = cap_by_source(rows, SOURCE_CAP, SEED)
    logger.info("Exporting %d rows after SOURCE_CAP (cap=%d).", len(rows), SOURCE_CAP)

    train, evalset = stratified_split(rows, EVAL_FRACTION, SEED)
    validate_no_leakage(train, evalset)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with TRAIN_PATH.open("w") as f:
        for row in train:
            f.write(json.dumps(build_example(row)) + "\n")
    with EVAL_PATH.open("w") as f:
        for row in evalset:
            f.write(json.dumps(build_example(row)) + "\n")

    def style_counts(rows_: list[FinetuneSample]) -> dict:
        counts: dict[str, int] = {}
        for r in rows_:
            counts[r.style] = counts.get(r.style, 0) + 1
        return counts

    manifest = {
        "total_exported": len(rows),
        "train_count": len(train),
        "eval_count": len(evalset),
        "eval_fraction_target": EVAL_FRACTION,
        "seed": SEED,
        "train_style_counts": style_counts(train),
        "eval_style_counts": style_counts(evalset),
        "all_style_counts": style_counts(rows),
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))

    # Mark exported -- idempotency: a re-run only picks up newly-ai_ready rows
    # next time, not ones already exported.
    ids = [r.id for r in rows]
    db.query(FinetuneSample).filter(FinetuneSample.id.in_(ids)).update(
        {FinetuneSample.status: "exported"}, synchronize_session=False
    )
    db.commit()

    print("\n" + "=" * 60)
    print("STEP 4 EXPORT SUMMARY")
    print("=" * 60)
    print(f"Total exported: {len(rows)}")
    print(f"Train: {len(train)} | Eval: {len(evalset)} ({len(evalset)/len(rows)*100:.1f}%)")
    print("Train style counts:", manifest["train_style_counts"])
    print("Eval style counts:", manifest["eval_style_counts"])
    print(f"Written to {TRAIN_PATH} and {EVAL_PATH}")
    print(f"Manifest: {MANIFEST_PATH}")

    db.close()


if __name__ == "__main__":
    main()
