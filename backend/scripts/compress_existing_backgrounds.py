"""One-off backfill: recompress background images uploaded before the
2026-09-20 compression pipeline (admin.py's _compress_background_image)
shipped. Idempotent and safe to re-run -- an image already .webp and
already under the size budget is left untouched, so running this twice
just reports "already compressed" the second time.

Usage:
    cd backend && venv/bin/python scripts/compress_existing_backgrounds.py
"""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.routes.admin import _BG_IMAGE_KEY_PREFIX, _BG_TARGET_MAX_BYTES, _compress_background_image
from app.db.models.app_setting import AppSetting
from app.db.session import SessionLocal
from app.services.runtime_settings import BACKGROUND_PAGES
from app.services.storage_service import get_storage_service


def main() -> None:
    db = SessionLocal()
    storage = get_storage_service()
    try:
        for page in BACKGROUND_PAGES:
            settings_key = f"{_BG_IMAGE_KEY_PREFIX}{page}"
            row = db.get(AppSetting, settings_key)
            if not row:
                print(f"{page}: no image, skipping")
                continue

            stored_key = row.value
            content = storage.read(stored_key)
            if stored_key.endswith(".webp") and len(content) <= _BG_TARGET_MAX_BYTES:
                print(f"{page}: already compressed ({len(content)} bytes, {stored_key}), skipping")
                continue

            compressed = _compress_background_image(content)
            new_key = f"branding/background-{page}-{uuid.uuid4()}.webp"
            storage.save(new_key, compressed)
            row.value = new_key
            db.commit()
            storage.delete(stored_key)
            print(f"{page}: {len(content):,} -> {len(compressed):,} bytes  ({stored_key} -> {new_key})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
