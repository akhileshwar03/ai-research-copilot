"""Step 3b — poll Kaggle kernels pushed by push_kaggle.py and ingest results.

Non-blocking by design: checks the status of every unpulled chunk in
`.kaggle_manifest.json`, downloads output for any that have finished, writes
`ai_text`/`status='ai_ready'` into `finetune_samples` for those rows, and
marks the chunk pulled. Chunks still running are reported and left alone —
just re-run this script again later (any number of times; it's idempotent).

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.kaggle.pull_kaggle
"""

import json
import logging

from app.db.models.finetune_sample import FinetuneSample
from app.db.session import SessionLocal
from scripts.finetune.kaggle.push_kaggle import HERE, WORK_DIR, load_manifest, save_manifest

logger = logging.getLogger(__name__)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    manifest = load_manifest()
    pending = [c for c in manifest["chunks"] if not c.get("pulled")]
    if not pending:
        logger.info("Nothing pending — every pushed chunk has already been pulled.")
        return

    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()

    db = SessionLocal()
    for chunk in pending:
        chunk_name = chunk["chunk_name"]
        kernel_ref = chunk["kernel_ref"]
        status = api.kernels_status(kernel_ref)
        # status.status is a KernelWorkerStatus enum -- str(status.status) gives
        # "KernelWorkerStatus.COMPLETE", not "complete", which silently broke the
        # comparison below (every chunk looked "still running" even when actually
        # done). Use .name explicitly.
        state = status.status.name
        logger.info("%s (%s): status=%s", chunk_name, kernel_ref, state)

        if state.upper() in ("CANCELLED", "CANCEL_ACKNOWLEDGED", "CANCELED"):
            # A manually-cancelled kernel never becomes COMPLETE/ERROR -- without
            # this, pull_kaggle.py would report "still running" for it forever,
            # and its rows would stay excluded from future push_kaggle.py
            # selection indefinitely even though nothing will ever finish them.
            logger.info("%s was cancelled -- marking pulled (0 rows) so its ids are eligible again.", chunk_name)
            chunk["pulled"] = True
            chunk["updated_count"] = 0
            chunk["missing_ids"] = chunk["row_ids"]
            save_manifest(manifest)
            continue

        if state.upper() == "ERROR":
            # Same lesson as the cancelled-chunk fix: an ERROR kernel never
            # becomes COMPLETE, so without marking it pulled here this would
            # log the same dead kernel as a fresh failure on every future run.
            logger.error(
                "%s failed on Kaggle's side (marking pulled, 0 rows). Check the kernel logs at "
                "https://www.kaggle.com/code/%s if you want to know why -- ids are eligible again.",
                chunk_name,
                kernel_ref,
            )
            chunk["pulled"] = True
            chunk["updated_count"] = 0
            chunk["missing_ids"] = chunk["row_ids"]
            save_manifest(manifest)
            continue

        if state.upper() not in ("COMPLETE", "COMPLETED"):
            logger.info("%s still running/queued — check again later.", chunk_name)
            continue

        out_dir = WORK_DIR / chunk_name / "output"
        out_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Downloading output for %s ...", chunk_name)
        api.kernels_output(kernel_ref, path=str(out_dir), force=True)

        output_jsonl = out_dir / "output.jsonl"
        if not output_jsonl.exists():
            logger.error(
                "%s marked complete but output.jsonl not found in downloaded output "
                "(dir=%s) — check the notebook actually wrote it; leaving chunk unpulled.",
                chunk_name,
                out_dir,
            )
            continue

        expected_ids = set(chunk["row_ids"])
        updated = 0
        missing = []
        with output_jsonl.open() as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                row_id = rec["id"]
                ai_text = rec.get("ai_text")
                if row_id not in expected_ids or not ai_text:
                    continue
                row = db.query(FinetuneSample).filter(FinetuneSample.id == row_id).one_or_none()
                if row is None:
                    continue
                row.ai_text = ai_text
                row.status = "ai_ready"
                updated += 1
        db.commit()

        got_ids = {json.loads(l)["id"] for l in output_jsonl.read_text().splitlines() if l.strip()}
        missing = sorted(expected_ids - got_ids)
        if missing:
            logger.warning(
                "%s: %d/%d rows updated, %d rows missing from output (will need a re-run/retry): %s%s",
                chunk_name,
                updated,
                len(expected_ids),
                len(missing),
                missing[:10],
                " ..." if len(missing) > 10 else "",
            )
        else:
            logger.info("%s: all %d rows updated successfully.", chunk_name, updated)

        chunk["pulled"] = True
        chunk["updated_count"] = updated
        chunk["missing_ids"] = missing
        save_manifest(manifest)

    db.close()


if __name__ == "__main__":
    main()
