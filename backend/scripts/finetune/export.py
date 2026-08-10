"""Step 4 — export the LoRA training set (Phase 2, Humaniser fine-tune).

Reads every ai-ified row from `finetune_samples` and formats it as a chat-style
training example matching exactly what Pass 2 sees in production today (same
system prompt, built from the real `app.services.humanizer.prompts` /
`app.services.humanizer.examples` modules — not a re-typed copy, so the LoRA is
trained on the identical instruction it will be invoked with at inference time):

    system:    BASE_PROMPT + "\n\n" + STRICT_HARD_RULES + "\n\n" + STYLE_GUIDANCE[style]
               + "\n\n" + format_examples(style)
    user:      ai_text        (the AI-flavored source to rewrite)
    assistant: human_text     (the genuine human-written target)

FIXED 2026-08-09: the original version of this file built system prompts from
BASE_PROMPT + STYLE_GUIDANCE only, despite its docstring's claim above -- it
omitted STRICT_HARD_RULES (the block that explicitly says "preserve facts,
numbers, names exactly," "never invent," "keep roughly the same length") and
the few-shot examples module, both of which production's real pipeline.py
always includes (see `_build_rewrite_prompt`). Root-caused via Step 6 local QA:
the resulting first checkpoint fabricated named people, quotes, and statistics
not present in the source whenever it chose to elaborate beyond the source's
length (confirmed reproducible on 2/3 fresh probe inputs, 6.7x-15.5x length
expansion each time). STRICT_HARD_RULES (not EXPANDED_HARD_RULES) is correct
here specifically because our human_text/ai_text pairs are themselves
same-length pairs, and STRICT is also pipeline.py's default (expand=False) --
this export was never meant to teach the elaboration behavior at all.
`format_examples()` mirrors production with its own default `limit=6`.

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
from app.services.humanizer.examples import format_examples
from app.services.humanizer.prompts import BASE_PROMPT, STRICT_HARD_RULES, STYLE_GUIDANCE
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
    # Mirrors pipeline.py's _build_rewrite_prompt exactly (STRICT_HARD_RULES, not
    # EXPANDED -- see module docstring) so training sees the identical system
    # prompt production actually sends.
    parts = [BASE_PROMPT, STRICT_HARD_RULES, STYLE_GUIDANCE[row.style], format_examples(row.style)]
    system = "\n\n".join(p for p in parts if p)
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

    # Includes "exported" as well as "ai_ready": this export already ran once (with
    # the pre-fix, incomplete system prompt) and flipped every row to "exported".
    # Re-running now must re-export those same rows with the corrected prompt, not
    # just wait for new ones that don't exist -- the AI-ify step already consumed
    # essentially all normal-style rows.
    rows = (
        db.query(FinetuneSample)
        .filter(FinetuneSample.status.in_(["ai_ready", "exported"]), FinetuneSample.ai_text.isnot(None))
        .all()
    )
    if not rows:
        logger.info("No ai-ified rows to export.")
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
