"""Admin-adjustable runtime settings.

Settings defined here can be changed by an admin at runtime (stored in the
app_settings table) without redeploying. Reads go through a short-lived
in-process cache so hot paths (upload size checks, rate limits, retrieval)
never add a per-request DB query.
"""

import logging
import time
from dataclasses import dataclass
from threading import Lock

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.db.models.app_setting import AppSetting

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SettingDef:
    type: type
    min: float
    max: float
    description: str


def _defs() -> dict[str, SettingDef]:
    return {
        "max_upload_size_mb": SettingDef(int, 1, 100, "Maximum PDF upload size in MB"),
        "rag_top_k": SettingDef(int, 1, 20, "Number of chunks retrieved per chat query"),
        "rag_similarity_threshold": SettingDef(
            float, 0.0, 2.0, "Cosine-distance cutoff for retrieved chunks (lower = stricter)"
        ),
        "chat_rate_limit_per_minute": SettingDef(int, 1, 1000, "Chat requests allowed per IP per minute"),
        "upload_rate_limit_per_minute": SettingDef(int, 1, 1000, "Uploads allowed per IP per minute"),
        "retention_days": SettingDef(
            int, 0, 365, "Days documents and chats are kept before automatic cleanup (0 = keep forever)"
        ),
    }


def _env_defaults() -> dict[str, int | float]:
    s = get_settings()
    return {
        "max_upload_size_mb": s.max_upload_size_mb,
        "rag_top_k": s.rag_top_k,
        "rag_similarity_threshold": s.rag_similarity_threshold,
        "chat_rate_limit_per_minute": 20,
        "upload_rate_limit_per_minute": 10,
        "retention_days": s.retention_days,
    }


class RuntimeSettingsStore:
    """DB-backed settings with a TTL cache. Thread-safe."""

    CACHE_TTL_SECONDS = 30

    def __init__(self) -> None:
        self._cache: dict[str, int | float] = {}
        self._loaded_at: float = 0.0
        self._lock = Lock()

    def get(self, key: str) -> int | float:
        with self._lock:
            self._refresh_if_stale()
            return self._cache[key]

    def all(self) -> dict[str, int | float]:
        with self._lock:
            self._refresh_if_stale()
            return dict(self._cache)

    def set(self, db: Session, key: str, value: int | float) -> None:
        defs = _defs()
        if key not in defs:
            raise AppError(code="UNKNOWN_SETTING", message=f"Unknown setting: {key}", status_code=400)

        d = defs[key]
        try:
            typed = d.type(value)
        except (TypeError, ValueError):
            raise AppError(
                code="INVALID_SETTING_VALUE",
                message=f"{key} must be a {d.type.__name__}",
                status_code=400,
            )
        if not (d.min <= typed <= d.max):
            raise AppError(
                code="SETTING_OUT_OF_RANGE",
                message=f"{key} must be between {d.min} and {d.max}",
                status_code=400,
            )

        row = db.get(AppSetting, key)
        if row:
            row.value = str(typed)
        else:
            db.add(AppSetting(key=key, value=str(typed)))
        db.commit()

        # Write-through: update the cache in place so reads immediately after
        # a PUT (including the PUT's own response) reflect the new value
        # without waiting for the TTL refresh.
        with self._lock:
            self._refresh_if_stale()
            self._cache[key] = typed
        logger.info("runtime_setting_updated key=%s value=%s", key, typed)

    def _refresh_if_stale(self) -> None:
        if time.monotonic() - self._loaded_at < self.CACHE_TTL_SECONDS and self._cache:
            return

        merged: dict[str, int | float] = dict(_env_defaults())
        try:
            from app.db.session import SessionLocal

            db = SessionLocal()
            try:
                defs = _defs()
                for row in db.query(AppSetting).all():
                    d = defs.get(row.key)
                    if d is None:
                        continue
                    try:
                        merged[row.key] = d.type(row.value)
                    except (TypeError, ValueError):
                        logger.warning("runtime_setting_corrupt key=%s value=%s", row.key, row.value)
            finally:
                db.close()
        except Exception:
            # Table may not exist yet (pre-migration boot); fall back to env defaults.
            logger.debug("runtime_settings_load_failed, using env defaults", exc_info=True)

        self._cache = merged
        self._loaded_at = time.monotonic()


runtime_settings = RuntimeSettingsStore()


def describe_settings() -> list[dict]:
    """Full setting descriptors for the admin UI."""
    current = runtime_settings.all()
    env = _env_defaults()
    return [
        {
            "key": key,
            "value": current[key],
            "default": env[key],
            "min": d.min,
            "max": d.max,
            "type": d.type.__name__,
            "description": d.description,
        }
        for key, d in _defs().items()
    ]


def chat_rate_limit() -> str:
    return f"{int(runtime_settings.get('chat_rate_limit_per_minute'))}/minute"


def upload_rate_limit() -> str:
    return f"{int(runtime_settings.get('upload_rate_limit_per_minute'))}/minute"
