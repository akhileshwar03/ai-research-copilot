"""Admin-adjustable runtime settings.

Settings defined here can be changed by an admin at runtime (stored in the
app_settings table) without redeploying. Reads go through a short-lived
in-process cache so hot paths (upload size checks, rate limits, retrieval)
never add a per-request DB query.

Four value types are supported: int, float, bool (stored as "1"/"0") and
str (bounded by ``max`` characters). Every setting belongs to a category
so the admin UI can group them.
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

SettingValue = int | float | bool | str


@dataclass(frozen=True)
class SettingDef:
    type: type
    min: float
    max: float
    description: str
    category: str = "limits"
    # Only meaningful for str settings: restricts the value to one of these
    # exact strings (e.g. a backend selector) instead of any text up to `max`
    # chars. None (the default) means "unrestricted text", same as before
    # this field existed.
    choices: frozenset[str] | None = None


def _bool_setting(description: str, category: str) -> SettingDef:
    return SettingDef(bool, 0, 1, description, category)


def _defs() -> dict[str, SettingDef]:
    return {
        # ── Platform ────────────────────────────────────────────────────────
        "maintenance_mode": _bool_setting(
            "Put the platform into maintenance mode: every tool request returns 503 while "
            "sign-in and the admin panel keep working.",
            "platform",
        ),
        "signups_enabled": _bool_setting(
            "Allow new accounts to be created (OTP and OAuth). Existing users can still sign in "
            "when this is off.",
            "platform",
        ),
        "announcement_text": SettingDef(
            str, 0, 300, "Banner shown to every signed-in user at the top of the workspace (empty = hidden)", "platform"
        ),
        # ── Feature switches ────────────────────────────────────────────────
        "tool_research_copilot_enabled": _bool_setting("Research Copilot (document chat) is available", "features"),
        "tool_humanizer_enabled": _bool_setting("Humanizer is available", "features"),
        "tool_checker_enabled": _bool_setting("AI Checker and Writing Feedback are available", "features"),
        "tool_realtime_enabled": _bool_setting("Real-time AI is available", "features"),
        "tool_paper_analyzer_enabled": _bool_setting("Paper Analyzer is available", "features"),
        "tool_extract_enabled": _bool_setting("URL / image text extraction is available", "features"),
        "chat_follow_up_suggestions": _bool_setting(
            "After each Research Copilot answer, generate three follow-up questions (one extra, "
            "cheap model call per reply)",
            "features",
        ),
        # ── Uploads & documents ─────────────────────────────────────────────
        "max_upload_size_mb": SettingDef(int, 1, 100, "Maximum PDF upload size in MB", "uploads"),
        "upload_rate_limit_per_minute": SettingDef(int, 1, 1000, "Uploads allowed per IP per minute", "uploads"),
        "documents_rate_limit_per_minute": SettingDef(
            int, 1, 1000, "Document list/status/delete/pin/download requests allowed per IP per minute", "uploads"
        ),
        "vision_ingestion_max_pages": SettingDef(
            int,
            0,
            300,
            "Max pages per document sent for vision captioning at upload (diagrams/charts become "
            "searchable). 0 disables vision ingestion entirely. Only pages that look visual (an "
            "embedded image, or unusually little extractable text) are ever sent, not every page.",
            "uploads",
        ),
        "retention_days": SettingDef(
            int, 0, 365, "Days documents and chats are kept before automatic cleanup (0 = keep forever)", "uploads"
        ),
        # ── Research Copilot ────────────────────────────────────────────────
        "rag_top_k": SettingDef(int, 1, 20, "Number of chunks retrieved per chat query", "research_copilot"),
        "rag_similarity_threshold": SettingDef(
            float, 0.0, 2.0, "Cosine-distance cutoff for retrieved chunks (lower = stricter)", "research_copilot"
        ),
        "rag_full_document_max_chars": SettingDef(
            int,
            10000,
            400000,
            "Character budget for whole-document context on counting/aggregate questions and research "
            "actions (summaries, reports). Above this, the answer is presented as a lower bound, not exact.",
            "research_copilot",
        ),
        "chat_rate_limit_per_minute": SettingDef(
            int, 1, 1000, "Chat requests allowed per IP per minute", "research_copilot"
        ),
        "chat_max_chars": SettingDef(
            int, 500, 50000, "Maximum characters accepted per chat message (matches the frontend counter)", "research_copilot"
        ),
        # ── Humanizer ───────────────────────────────────────────────────────
        # 2026-09-19: which backend serves Ultra Human. "local" = the existing
        # Ollama/llama.cpp path (this dev Mac or a future always-on home
        # machine) -- fine for one user at a time, not built for concurrency.
        # "modal" = the new Modal + vLLM deployment (scripts/finetune/
        # serve_ultra_vllm.py), built specifically for multiple simultaneous
        # users (~10-20x Ollama's throughput under concurrent load, measured/
        # researched 2026-09-19). "off" = Ultra Human answers 503 regardless of
        # which backend would otherwise be configured, same shape as the
        # existing tool_*_enabled kill switches but scoped to just this one
        # sub-feature so Basic keeps working. Default "local" preserves exactly
        # today's behavior for anyone who hasn't touched this setting yet.
        "humanizer_ultra_backend": SettingDef(
            str,
            0,
            10,
            "Which backend serves Ultra Human: 'local' (Ollama, single-user, this machine or a "
            "future always-on home machine), 'modal' (Modal + vLLM, built for multiple concurrent "
            "users), or 'off' (Ultra Human unavailable, Basic still works).",
            "humanizer",
            choices=frozenset({"off", "modal", "local"}),
        ),
        "humanize_max_chars": SettingDef(int, 500, 50000, "Maximum characters accepted per Humaniser request", "humanizer"),
        "humanize_min_words": SettingDef(
            int,
            0,
            500,
            "Minimum words required per Humaniser request (0 = no minimum). Very short text reads "
            "as low-confidence to any AI detector regardless of authorship, so rewriting it can't "
            "reliably move the needle — see the AI Checker's own confidence threshold.",
            "humanizer",
        ),
        "humanize_max_words": SettingDef(
            int, 100, 20000, "Maximum words accepted per Humaniser request (in addition to humanize_max_chars)", "humanizer"
        ),
        "humanize_rate_limit_per_hour": SettingDef(int, 1, 1000, "Humaniser requests allowed per IP per hour", "humanizer"),
        # ── AI Checker ──────────────────────────────────────────────────────
        "checker_max_chars": SettingDef(int, 200, 50000, "Maximum characters accepted per AI Checker request", "checker"),
        "checker_rate_limit_per_hour": SettingDef(int, 1, 1000, "AI Checker requests allowed per IP per hour", "checker"),
        "feedback_max_chars": SettingDef(
            int, 200, 50000, "Maximum characters accepted per Writing Feedback request", "checker"
        ),
        "feedback_rate_limit_per_hour": SettingDef(
            int, 1, 1000, "Writing Feedback requests allowed per IP per hour", "checker"
        ),
        # ── Real-time AI ────────────────────────────────────────────────────
        "realtime_rate_limit_per_hour": SettingDef(int, 1, 1000, "Real-time AI requests allowed per IP per hour", "realtime"),
        # ── Text extraction ─────────────────────────────────────────────────
        "extract_rate_limit_per_hour": SettingDef(
            int, 1, 1000, "URL/image text-extraction requests allowed per IP per hour", "extract"
        ),
        # ── Paper Analyzer ──────────────────────────────────────────────────
        "paper_analyzer_max_pages": SettingDef(
            int, 1, 300, "Maximum PDF pages accepted per Paper Analyzer request", "paper_analyzer"
        ),
        "paper_analyzer_rate_limit_per_hour": SettingDef(
            int, 1, 1000, "Paper Analyzer requests allowed per IP per hour", "paper_analyzer"
        ),
    }


CATEGORY_LABELS: dict[str, str] = {
    "platform": "Platform",
    "features": "Feature switches",
    "uploads": "Uploads & retention",
    "research_copilot": "Research Copilot",
    "humanizer": "Humanizer",
    "checker": "AI Checker",
    "realtime": "Real-time AI",
    "extract": "Text extraction",
    "paper_analyzer": "Paper Analyzer",
}


def _env_defaults() -> dict[str, SettingValue]:
    s = get_settings()
    return {
        "maintenance_mode": False,
        "signups_enabled": True,
        "announcement_text": "",
        "tool_research_copilot_enabled": True,
        "tool_humanizer_enabled": True,
        "tool_checker_enabled": True,
        "tool_realtime_enabled": True,
        "tool_paper_analyzer_enabled": True,
        "tool_extract_enabled": True,
        "humanizer_ultra_backend": "local",
        "chat_follow_up_suggestions": True,
        "max_upload_size_mb": s.max_upload_size_mb,
        "rag_top_k": s.rag_top_k,
        "rag_similarity_threshold": s.rag_similarity_threshold,
        "chat_rate_limit_per_minute": 20,
        "chat_max_chars": 4000,
        "rag_full_document_max_chars": 150000,
        "vision_ingestion_max_pages": 40,
        "upload_rate_limit_per_minute": 10,
        "documents_rate_limit_per_minute": 60,
        "retention_days": s.retention_days,
        "humanize_max_chars": 20000,
        "humanize_min_words": 30,
        "humanize_max_words": 3000,
        "humanize_rate_limit_per_hour": 30,
        "checker_max_chars": 20000,
        "checker_rate_limit_per_hour": 30,
        "realtime_rate_limit_per_hour": 30,
        "feedback_max_chars": 20000,
        "feedback_rate_limit_per_hour": 30,
        "extract_rate_limit_per_hour": 20,
        "paper_analyzer_max_pages": 60,
        "paper_analyzer_rate_limit_per_hour": 20,
    }


_TRUE_STRINGS = frozenset({"1", "true", "yes", "on"})
_FALSE_STRINGS = frozenset({"0", "false", "no", "off", ""})


def _coerce(key: str, d: SettingDef, value) -> SettingValue:
    """Validate and convert *value* to the setting's declared type."""
    if d.type is bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)) and value in (0, 1):
            return bool(value)
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in _TRUE_STRINGS:
                return True
            if lowered in _FALSE_STRINGS:
                return False
        raise AppError(code="INVALID_SETTING_VALUE", message=f"{key} must be true or false", status_code=400)

    if d.type is str:
        if not isinstance(value, str):
            raise AppError(code="INVALID_SETTING_VALUE", message=f"{key} must be text", status_code=400)
        text = value.strip()
        if len(text) > d.max:
            raise AppError(
                code="SETTING_OUT_OF_RANGE",
                message=f"{key} must be at most {int(d.max)} characters",
                status_code=400,
            )
        if d.choices is not None and text not in d.choices:
            raise AppError(
                code="INVALID_SETTING_VALUE",
                message=f"{key} must be one of: {', '.join(sorted(d.choices))}",
                status_code=400,
            )
        return text

    if isinstance(value, bool) or isinstance(value, str) and not value.strip():
        raise AppError(code="INVALID_SETTING_VALUE", message=f"{key} must be a {d.type.__name__}", status_code=400)
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
    return typed


def _serialize(d: SettingDef, value: SettingValue) -> str:
    if d.type is bool:
        return "1" if value else "0"
    return str(value)


def _parse_stored(d: SettingDef, raw: str) -> SettingValue:
    if d.type is bool:
        return raw.strip().lower() in _TRUE_STRINGS
    if d.type is str:
        return raw
    return d.type(raw)


class RuntimeSettingsStore:
    """DB-backed settings with a TTL cache. Thread-safe."""

    CACHE_TTL_SECONDS = 30

    def __init__(self) -> None:
        self._cache: dict[str, SettingValue] = {}
        self._loaded_at: float = 0.0
        self._lock = Lock()

    def get(self, key: str) -> SettingValue:
        with self._lock:
            self._refresh_if_stale()
            return self._cache[key]

    def all(self) -> dict[str, SettingValue]:
        with self._lock:
            self._refresh_if_stale()
            return dict(self._cache)

    def set(self, db: Session, key: str, value) -> None:
        defs = _defs()
        if key not in defs:
            raise AppError(code="UNKNOWN_SETTING", message=f"Unknown setting: {key}", status_code=400)

        d = defs[key]
        typed = _coerce(key, d, value)

        row = db.get(AppSetting, key)
        if row:
            row.value = _serialize(d, typed)
        else:
            db.add(AppSetting(key=key, value=_serialize(d, typed)))
        db.commit()

        # Write-through: update the cache in place so reads immediately after
        # a PUT (including the PUT's own response) reflect the new value
        # without waiting for the TTL refresh.
        with self._lock:
            self._refresh_if_stale()
            self._cache[key] = typed
        logger.info("runtime_setting_updated key=%s value=%s", key, typed)

    def invalidate(self) -> None:
        """Force the next read to reload from the database (tests, and any
        code path that writes app_settings rows directly)."""
        with self._lock:
            self._loaded_at = 0.0

    def _refresh_if_stale(self) -> None:
        if time.monotonic() - self._loaded_at < self.CACHE_TTL_SECONDS and self._cache:
            return

        merged: dict[str, SettingValue] = dict(_env_defaults())
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
                        merged[row.key] = _parse_stored(d, row.value)
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
    """Full setting descriptors for the admin UI, in declaration order."""
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
            "category": d.category,
            "category_label": CATEGORY_LABELS.get(d.category, d.category),
            "description": d.description,
            "choices": sorted(d.choices) if d.choices else None,
        }
        for key, d in _defs().items()
    ]


def chat_rate_limit() -> str:
    return f"{int(runtime_settings.get('chat_rate_limit_per_minute'))}/minute"


def upload_rate_limit() -> str:
    return f"{int(runtime_settings.get('upload_rate_limit_per_minute'))}/minute"


def documents_rate_limit() -> str:
    return f"{int(runtime_settings.get('documents_rate_limit_per_minute'))}/minute"


def humanize_rate_limit() -> str:
    return f"{int(runtime_settings.get('humanize_rate_limit_per_hour'))}/hour"


def checker_rate_limit() -> str:
    return f"{int(runtime_settings.get('checker_rate_limit_per_hour'))}/hour"


def realtime_rate_limit() -> str:
    return f"{int(runtime_settings.get('realtime_rate_limit_per_hour'))}/hour"


def feedback_rate_limit() -> str:
    return f"{int(runtime_settings.get('feedback_rate_limit_per_hour'))}/hour"


def extract_rate_limit() -> str:
    return f"{int(runtime_settings.get('extract_rate_limit_per_hour'))}/hour"


def paper_analyzer_rate_limit() -> str:
    return f"{int(runtime_settings.get('paper_analyzer_rate_limit_per_hour'))}/hour"
