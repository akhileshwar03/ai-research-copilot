"""Step 3a — push a chunk of tagged samples to Kaggle for AI-ify generation.

Exports rows still missing `ai_text` as a JSONL work-batch, uploads it as a
private Kaggle Dataset, then pushes `aiify_notebook.ipynb` as a GPU-enabled
Kaggle Kernel pointed at that dataset and starts it running.

Transport design (see STATE.md "Key decisions"): Kaggle never gets Neon DB
credentials. Only `id`/`human_text`/`style` leave this machine; the kernel
writes back `id`/`ai_text` pairs as its output, which `pull_kaggle.py` reads
and applies to the DB locally.

Resumable/idempotent: rows already pushed in an unpulled chunk (tracked in
`.kaggle_manifest.json`) are excluded from the next chunk's selection, so
re-running this script never double-sends the same rows. This script does
NOT block waiting for the GPU run to finish — call `pull_kaggle.py` later
(any number of times) to check status and ingest results when ready.

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.kaggle.push_kaggle [--chunk-size 2500]
"""

import argparse
import json
import logging
import shutil
import sys
import time
from pathlib import Path

from app.db.models.finetune_sample import FinetuneSample
from app.db.session import SessionLocal
from scripts.finetune.aiify_split import KAGGLE_CUTOFF

logger = logging.getLogger(__name__)

HERE = Path(__file__).parent
MANIFEST_FILE = HERE / ".kaggle_manifest.json"
WORK_DIR = HERE / "work"
NOTEBOOK_FILE = HERE / "aiify_notebook.ipynb"

DEFAULT_CHUNK_SIZE = 2500


def load_manifest() -> dict:
    if MANIFEST_FILE.exists():
        return json.loads(MANIFEST_FILE.read_text())
    return {"chunks": []}


def save_manifest(manifest: dict) -> None:
    MANIFEST_FILE.write_text(json.dumps(manifest, indent=2))


def next_chunk_index(manifest: dict) -> int:
    return len(manifest["chunks"])


def ids_in_flight(manifest: dict) -> set[int]:
    """Row ids already pushed to Kaggle in a chunk that hasn't been pulled yet."""
    ids: set[int] = set()
    for chunk in manifest["chunks"]:
        if not chunk.get("pulled"):
            ids.update(chunk["row_ids"])
    return ids


def select_rows(db, chunk_size: int, exclude_ids: set[int]) -> list[FinetuneSample]:
    # 2026-08-06 checkpoint: AI-ify generation is split across model families
    # for diversity (see STATE.md "PHASE 2 REOPENED"), now 5-way as of round 7.
    # Partitioned deterministically by `id % 100` so this script and
    # aiify_api.py never race for the same row -- the actual cutoff lives in
    # aiify_split.py (single source of truth; this used to be a second
    # hardcoded copy kept in sync only by a comment, found and fixed in a
    # 2026-08-06 cleanup).
    #
    # style == "normal" added 2026-08-07: production only ever ships `normal`
    # style (frontend/app/humanizer/page.tsx parks clear_structured/
    # simple_formal), so training on the other two right now would spend the
    # LoRA's limited capacity on registers nothing ships. Same filter added
    # to aiify_api.py's select_rows for consistency.
    query = (
        db.query(FinetuneSample)
        .filter(
            FinetuneSample.status == "tagged",
            FinetuneSample.style == "normal",
            FinetuneSample.ai_text.is_(None),
            (FinetuneSample.id % 100) < KAGGLE_CUTOFF,
        )
        .order_by(FinetuneSample.id)
    )
    rows = []
    for row in query:
        if row.id in exclude_ids:
            continue
        rows.append(row)
        if len(rows) >= chunk_size:
            break
    return rows


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--chunk-size", type=int, default=DEFAULT_CHUNK_SIZE)
    parser.add_argument(
        "--dataset-only",
        action="store_true",
        help=(
            "Create the Kaggle Dataset and stop there -- do NOT push/start the GPU kernel, "
            "and do NOT record a manifest entry (so these rows stay eligible for the real "
            "chunk push afterward). For verifying Kaggle Dataset creation works before any "
            "GPU time is spent."
        ),
    )
    args = parser.parse_args()

    if not args.dataset_only and not NOTEBOOK_FILE.exists():
        logger.error("Missing %s — write the notebook before pushing.", NOTEBOOK_FILE)
        sys.exit(1)

    manifest = load_manifest()
    in_flight = ids_in_flight(manifest)
    if in_flight:
        logger.info(
            "%d rows already pushed in an unpulled chunk — excluding them from selection. "
            "Run pull_kaggle.py first if you want those results before pushing more.",
            len(in_flight),
        )

    db = SessionLocal()
    rows = select_rows(db, args.chunk_size, in_flight)
    if not rows:
        logger.info("Nothing to push — no rows with status='tagged' and ai_text IS NULL left.")
        db.close()
        return

    chunk_index = next_chunk_index(manifest)
    chunk_name = f"chunk-{chunk_index:02d}"
    logger.info("Preparing %s: %d rows (ids %d..%d)", chunk_name, len(rows), rows[0].id, rows[-1].id)

    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()
    username = api.get_config_value("username")

    chunk_dir = WORK_DIR / chunk_name
    input_dir = chunk_dir / "input"
    kernel_dir = chunk_dir / "kernel"
    input_dir.mkdir(parents=True, exist_ok=True)
    kernel_dir.mkdir(parents=True, exist_ok=True)

    # --- write the JSONL work-batch ---
    input_jsonl = input_dir / "input.jsonl"
    with input_jsonl.open("w") as f:
        for row in rows:
            f.write(json.dumps({"id": row.id, "human_text": row.human_text, "style": row.style}) + "\n")

    # 2026-08-08: found the hard way that `chunk_name` alone is NOT collision-safe.
    # It's derived from the *local* manifest's length, which has no idea what
    # datasets already exist on Kaggle's servers -- when this session's local
    # manifest got reset earlier, chunk naming restarted at "chunk-00", directly
    # colliding with the *original attempt's* leftover `finetune-chunk-00-input`
    # dataset still sitting on Kaggle from weeks ago. `dataset_create_new` did
    # not error or overwrite it -- confirmed by downloading the "new" dataset
    # afterward and finding it was still the old 2,500-row content, not our
    # fresh 1,262-row upload. The kernel silently ran on stale data, wasting
    # real GPU quota, until caught by chance (the user noticed a row-count
    # mismatch in the Kaggle UI). Fixed by making the slug globally unique via
    # a timestamp suffix, independent of any local/remote naming-counter drift.
    #
    # Use a name that can never collide with a real chunk push so a
    # --dataset-only test never blocks or gets confused with production data.
    dataset_slug = (
        "finetune-dataset-only-test-input"
        if args.dataset_only
        else f"finetune-{chunk_name}-{int(time.time())}-input"
    )
    dataset_ref = f"{username}/{dataset_slug}"
    (input_dir / "dataset-metadata.json").write_text(
        json.dumps(
            {
                "title": f"finetune {chunk_name} input",
                "id": dataset_ref,
                "licenses": [{"name": "unknown"}],
            },
            indent=2,
        )
    )

    logger.info("Creating private Kaggle Dataset %s ...", dataset_ref)
    api.dataset_create_new(str(input_dir), public=False, quiet=False, convert_to_csv=False, dir_mode="zip")

    # Kaggle dataset creation/processing is async on their side. dataset_status
    # returning OK is not sufficient -- confirmed the hard way: a kernel pushed
    # right after a 30s dataset_status-only wait started with no input file
    # mounted at all (AssertionError in the notebook, 0 GPU time meaningfully
    # spent). Poll dataset_list_files instead, which only succeeds once the
    # file is actually processed and attachable to a kernel, and use a longer
    # budget (up to ~2 minutes) before giving up.
    ready = False
    for attempt in range(40):
        time.sleep(3)
        try:
            files = api.dataset_list_files(dataset_ref).files
            if any(f.name == "input.jsonl" for f in files):
                ready = True
                break
        except Exception:
            pass
    if ready:
        logger.info("Dataset confirmed ready (input.jsonl visible via dataset_list_files).")
    else:
        logger.warning(
            "Could not confirm dataset file listing is ready after ~2 minutes — "
            "proceeding anyway, but the kernel may fail to find its input again."
        )

    if args.dataset_only:
        db.close()
        print(f"\n--dataset-only: created {dataset_ref} successfully. No kernel pushed, no GPU time spent.")
        print("No manifest entry recorded -- these rows remain eligible for the real chunk push.")
        return

    # --- push the notebook as a GPU kernel pointed at that dataset ---
    # Kernel slug made unique the same way as dataset_slug above (see the
    # comment there) -- kernels_push updates-in-place on a collision rather
    # than silently pointing at stale data the way the dataset did, so this
    # was lower-risk, but reusing "finetune-aiify-chunk-00" would still mix
    # this run's version history with the original attempt's unrelated old
    # kernel of the same name, which is confusing to look at later.
    kernel_slug = f"finetune-aiify-{chunk_name}-{int(time.time())}"
    kernel_ref = f"{username}/{kernel_slug}"
    shutil.copy(NOTEBOOK_FILE, kernel_dir / "aiify_notebook.ipynb")
    (kernel_dir / "kernel-metadata.json").write_text(
        json.dumps(
            {
                "id": kernel_ref,
                "title": kernel_slug,
                "code_file": "aiify_notebook.ipynb",
                "language": "python",
                "kernel_type": "notebook",
                "is_private": True,
                "enable_gpu": True,
                "enable_internet": True,
                "dataset_sources": [dataset_ref],
                "competition_sources": [],
                "kernel_sources": [],
            },
            indent=2,
        )
    )

    logger.info("Pushing + starting Kaggle kernel %s (GPU) ...", kernel_ref)
    api.kernels_push(str(kernel_dir))

    manifest["chunks"].append(
        {
            "chunk_name": chunk_name,
            "row_ids": [r.id for r in rows],
            "dataset_ref": dataset_ref,
            "kernel_ref": kernel_ref,
            "pushed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "pulled": False,
        }
    )
    save_manifest(manifest)
    db.close()

    print(f"\nPushed {chunk_name}: {len(rows)} rows -> kernel {kernel_ref}")
    print("Kaggle is now running the notebook on its free GPU. This is NOT blocking.")
    print("Check progress / pull results later with:")
    print("  python -m scripts.finetune.kaggle.pull_kaggle")


if __name__ == "__main__":
    main()
