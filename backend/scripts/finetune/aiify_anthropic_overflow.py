"""One-off, 2026-08-08: Anthropic's real account balance ran down to $0.13
(confirmed by the user against their actual Anthropic console, not guessed)
with 304 rows still left in its bucket. Rather than ask for another top-up
mid-checkpoint, the user's call: spend exactly the real remaining $0.13 on
Anthropic (whatever real rows that affords, ~31 at the measured
$0.004143/row rate), then send everything Anthropic doesn't get to Google
instead -- Google finished its own full bucket already spending only $1.56
of its $5, so it has real headroom to absorb the rest cheaply.

Not a permanent addition to aiify_split.py's percentages -- this is a
one-time rebalance of what's left unclaimed in ANTHROPIC_BUCKET specifically,
not a change to how future corpora would be split. Safe to delete after use.

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.aiify_anthropic_overflow
"""

import logging
import sys

from dotenv import load_dotenv

load_dotenv()

from app.db.session import SessionLocal
from scripts.finetune import aiify_api
from scripts.finetune.aiify_split import ANTHROPIC_BUCKET

logger = logging.getLogger(__name__)


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    db = SessionLocal()

    # Step 1: spend exactly the real remaining Anthropic balance, not the
    # usual $5 -- restarting with the default budget would let the script
    # keep trying past the account's actual real balance, hitting real
    # billing failures instead of stopping cleanly.
    aiify_api.BUDGET_USD["anthropic"] = 0.13
    logger.info("=== Anthropic leg, capped at real remaining balance ($0.13) ===")
    aiify_api.run_provider_budgeted(db, "anthropic", ANTHROPIC_BUCKET)

    # Step 2: whatever's left unclaimed in Anthropic's bucket (id range, not
    # provider) now gets processed by Google instead -- Google's own bucket
    # already finished, so this reuses its cheap, verified-working model on
    # the rows Anthropic couldn't afford. $2.00 cap here is generous
    # headroom, not an expected spend -- real Google cost for ~270 rows at
    # the measured ~$0.0006/row rate is well under $0.20.
    aiify_api.BUDGET_USD["google"] = 2.00
    logger.info("=== Overflow: remaining Anthropic-bucket rows -> Google ===")
    aiify_api.run_provider_budgeted(db, "google", ANTHROPIC_BUCKET)

    from app.db.models.finetune_sample import FinetuneSample

    total_ai_ready = db.query(FinetuneSample).filter(FinetuneSample.status == "ai_ready").count()
    total = db.query(FinetuneSample).count()
    print(f"\nTotal ai_ready: {total_ai_ready}/{total}")
    db.close()


if __name__ == "__main__":
    main()
