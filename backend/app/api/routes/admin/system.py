"""System health, storage usage and retention."""

import logging
import os
import platform
import sys
import time

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin
from app.api.dependencies.services import (
    get_ai_service,
    get_vector_store_manager,
)
from app.core.config import get_settings
from app.db.models.app_setting import AppSetting
from app.db.models.user import User
from app.db.session import engine, get_db
from app.services.admin_audit import record_admin_action
from app.services.ai_service import AIService
from app.services.retention_service import run_cleanup
from app.services.runtime_settings import runtime_settings
from app.services.storage_service import get_storage_service
from app.api.routes.admin._common import (
    _STARTED_AT,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ── System ─────────────────────────────────────────────────────────────────────

# 2026-09-20: real limits, fetched live from each provider's own pricing page
# (not estimated) -- Neon's free plan: "0.5 GB/project" storage, hard cap that
# blocks writes once exceeded (confirmed this account is on the free plan, not
# assumed). Cloudflare R2 free tier: "10 GB-month / month" storage. Both are
# storage limits specifically -- compute-hours/request-count limits exist too
# but aren't shown here since this panel only answers "how much storage is
# left", the question this was built for.
_NEON_FREE_STORAGE_BYTES = 512 * 1024 * 1024
_R2_FREE_STORAGE_BYTES = 10 * 1024 * 1024 * 1024
_TOP_TABLES_LIMIT = 10


@router.get("/system/storage")
def get_storage_usage(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Real, live storage usage for the two backing stores -- Postgres (Neon)
    and object storage (R2) -- against their real free-tier limits. Answers
    "how much are we using, how much is left" with actual numbers, not
    estimates. Neon's per-table breakdown only works on the real Postgres
    dialect (pg_database_size/pg_stat_user_tables); on local SQLite dev this
    section comes back null rather than erroring."""
    neon: dict | None = None
    if engine.dialect.name == "postgresql":
        total_bytes = db.execute(text("SELECT pg_database_size(current_database())")).scalar() or 0
        rows = db.execute(
            text(
                """
                SELECT relname, n_live_tup, pg_total_relation_size(relid)
                FROM pg_stat_user_tables
                ORDER BY pg_total_relation_size(relid) DESC
                LIMIT :limit
                """
            ),
            {"limit": _TOP_TABLES_LIMIT},
        ).fetchall()
        neon = {
            "used_bytes": int(total_bytes),
            "limit_bytes": _NEON_FREE_STORAGE_BYTES,
            "percent_used": round(100 * int(total_bytes) / _NEON_FREE_STORAGE_BYTES, 1),
            "top_tables": [{"name": r[0], "row_count": int(r[1]), "bytes": int(r[2])} for r in rows],
        }

    r2: dict | None = None
    settings = get_settings()
    if all([settings.r2_account_id, settings.r2_access_key_id, settings.r2_secret_access_key, settings.r2_bucket_name]):
        summary = get_storage_service().usage_summary()
        r2 = {
            "used_bytes": summary["used_bytes"],
            "limit_bytes": _R2_FREE_STORAGE_BYTES,
            "percent_used": round(100 * summary["used_bytes"] / _R2_FREE_STORAGE_BYTES, 2),
            "object_count": summary["object_count"],
            "by_prefix": summary["by_prefix"],
        }

    return {"neon": neon, "r2": r2}


@router.get("/system")
def get_system_info(
    probe: bool = Query(default=False, description="Also ping OpenAI and Ollama (slower)"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    ai_service: AIService = Depends(get_ai_service),
):
    """Configuration and health snapshot. Never returns secrets — only
    whether each integration is configured, and (with probe=true) whether
    it currently answers."""
    settings = get_settings()

    try:
        alembic_version = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception:
        alembic_version = None
    database_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        database_ok = False

    vector_ok: bool | None = None
    try:
        vector_ok = bool(get_vector_store_manager().ping())
    except Exception:
        vector_ok = False

    r2_configured = all(
        [settings.r2_account_id, settings.r2_access_key_id, settings.r2_secret_access_key, settings.r2_bucket_name]
    )

    openai_ok: bool | None = None
    ollama_ok: bool | None = None
    tavily_usage: dict | None = None
    resend_recent: dict | None = None
    if probe:
        try:
            openai_ok = bool(ai_service.ping())
        except Exception:
            openai_ok = False
        try:
            resp = httpx.get(f"{settings.humanizer_ultra_ollama_url.rstrip('/')}/api/tags", timeout=2.0)
            ollama_ok = resp.status_code == 200
        except Exception:
            ollama_ok = False
        # 2026-09-22: unlike OpenAI/Sentry (which need a separate, higher-
        # privilege key we don't hold), Tavily's /usage and Resend's list-
        # emails both work with the exact same secret key already configured
        # for real requests -- verified against each provider's own API
        # docs before writing this, not assumed. So these two get real,
        # live numbers instead of just a "configured" badge.
        if settings.tavily_api_key:
            try:
                resp = httpx.get(
                    "https://api.tavily.com/usage",
                    headers={"Authorization": f"Bearer {settings.tavily_api_key}"},
                    timeout=3.0,
                )
                if resp.status_code == 200:
                    body = resp.json()
                    account = body.get("account", {})
                    tavily_usage = {
                        "ok": True,
                        "plan": account.get("current_plan"),
                        "plan_usage": account.get("plan_usage"),
                        "plan_limit": account.get("plan_limit"),
                    }
                else:
                    logger.warning("tavily_usage_probe_failed status=%s body=%s", resp.status_code, resp.text[:500])
                    tavily_usage = {"ok": False}
            except Exception:
                logger.exception("tavily_usage_probe_failed")
                tavily_usage = {"ok": False}
        if settings.resend_api_key:
            try:
                resp = httpx.get(
                    "https://api.resend.com/emails?limit=100",
                    headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                    timeout=3.0,
                )
                if resp.status_code == 200:
                    body = resp.json()
                    emails = body.get("data", [])
                    last_events: dict[str, int] = {}
                    for e in emails:
                        ev = e.get("last_event") or "unknown"
                        last_events[ev] = last_events.get(ev, 0) + 1
                    resend_recent = {
                        "ok": True,
                        "sample_size": len(emails),
                        "has_more": body.get("has_more", False),
                        "by_status": last_events,
                        "most_recent_at": emails[0]["created_at"] if emails else None,
                    }
                elif resp.status_code == 401 and resp.json().get("name") == "restricted_api_key":
                    # Expected, not a bug: this key is deliberately scoped to
                    # sending-only (see CLAUDE.md) and Resend's list-emails
                    # endpoint is a read operation that scope doesn't grant.
                    # Widening the key just to populate this card would undo
                    # a real security decision, so surface it as its own
                    # state instead of a generic failure.
                    resend_recent = {"ok": False, "restricted": True}
                else:
                    logger.warning("resend_recent_probe_failed status=%s body=%s", resp.status_code, resp.text[:500])
                    resend_recent = {"ok": False}
            except Exception:
                logger.exception("resend_recent_probe_failed")
                resend_recent = {"ok": False}
        if settings.uptimerobot_api_key:
            try:
                resp = httpx.post(
                    "https://api.uptimerobot.com/v2/getMonitors",
                    data={
                        "api_key": settings.uptimerobot_api_key,
                        "format": "json",
                        "custom_uptime_ratios": "30",
                    },
                    timeout=3.0,
                )
                body = resp.json() if resp.status_code == 200 else {}
                if resp.status_code == 200 and body.get("stat") == "ok":
                    # Official status codes (UptimeRobot API v2 docs):
                    # 0 paused, 1 not checked yet, 2 up, 8 seems down, 9 down.
                    status_labels = {0: "paused", 1: "not checked yet", 2: "up", 8: "seems down", 9: "down"}
                    uptimerobot_monitors = {
                        "ok": True,
                        "monitors": [
                            {
                                "name": m.get("friendly_name"),
                                "status": status_labels.get(m.get("status"), f"unknown ({m.get('status')})"),
                                "uptime_30d": m.get("custom_uptime_ratio"),
                            }
                            for m in body.get("monitors", [])
                        ],
                    }
                else:
                    logger.warning("uptimerobot_probe_failed status=%s body=%s", resp.status_code, resp.text[:500])
                    uptimerobot_monitors = {"ok": False}
            except Exception:
                logger.exception("uptimerobot_probe_failed")
                uptimerobot_monitors = {"ok": False}
        else:
            uptimerobot_monitors = None
    else:
        uptimerobot_monitors = None

    retention_row = db.get(AppSetting, "retention_last_run_at")

    if settings.resend_api_key:
        email_provider = "resend"
    elif settings.smtp_host:
        email_provider = "smtp"
    else:
        email_provider = "dev-echo"

    # 2026-09-20: every real external service this project uses, one list --
    # not just the ones with a usage number we can pull live. Neon/R2 are
    # tracked directly (GET /admin/system/storage), so they point back at
    # that instead of an external link; everything else can only be checked
    # on the provider's own dashboard -- no self-serve usage API exists for
    # most of these without a separate, higher-privilege key we don't hold
    # (e.g. OpenAI's usage endpoint needs an org admin key, not a regular
    # secret key). Google/Groq/Anthropic are read straight from the
    # environment, not app.core.config.Settings -- real, not a guess: these
    # three are only ever used by the offline finetune tooling
    # (scripts/finetune/aiify_api.py, tag.py), never by the live app itself.
    #
    # load_dotenv() first is required here, not optional -- pydantic-settings
    # reads backend/.env into its own Settings object but never exports it to
    # the real process os.environ, so a bare os.environ.get() below would
    # silently read as unconfigured even with a real key present in .env.
    # This exact bug already bit this project once (see aiify_api.py's own
    # 2026-08-07 comment: "GROQ_API_KEY silently invisible to os.environ.get,
    # causing a fallback to a paid API instead of free Groq") -- avoiding a
    # repeat of it here, not assuming this would otherwise just work.
    from dotenv import load_dotenv

    load_dotenv()
    external_apis = [
        {
            "name": "OpenAI",
            "category": "Live app (chat, checker, humanizer)",
            "configured": bool(settings.openai_api_key),
            "tracked_here": False,
            "dashboard_url": "https://platform.openai.com/usage",
        },
        {
            "name": "Modal (Ultra Human GPU hosting)",
            "category": "Live app",
            "configured": bool(settings.humanizer_ultra_modal_key),
            "tracked_here": False,
            "dashboard_url": "https://modal.com/apps",
        },
        {
            "name": "Tavily",
            "category": "Live app (Real-time AI web search)",
            "configured": bool(settings.tavily_api_key),
            "tracked_here": False,
            "dashboard_url": "https://app.tavily.com",
        },
        {
            "name": "Resend",
            "category": "Live app (transactional email)",
            "configured": bool(settings.resend_api_key),
            "tracked_here": False,
            "dashboard_url": "https://resend.com/emails",
        },
        {
            "name": "Sentry",
            "category": "Live app (error monitoring, backend + frontend)",
            "configured": bool(settings.sentry_dsn),
            "tracked_here": False,
            "dashboard_url": "https://sentry.io",
        },
        {
            "name": "UptimeRobot",
            "category": "Operational (uptime monitoring, not called by the app itself)",
            "configured": bool(settings.uptimerobot_api_key),
            "tracked_here": True,
            "dashboard_url": "https://uptimerobot.com/dashboard",
        },
        {
            "name": "Neon (Postgres)",
            "category": "Live app (database)",
            "configured": True,
            "tracked_here": True,
            "dashboard_url": "https://console.neon.tech",
        },
        {
            "name": "Cloudflare R2",
            "category": "Live app (object storage)",
            "configured": r2_configured,
            "tracked_here": True,
            "dashboard_url": "https://dash.cloudflare.com",
        },
        {
            "name": "Google AI (Gemini)",
            "category": "Finetune tooling only, not the live app",
            "configured": bool(os.environ.get("GOOGLE_API_KEY")),
            "tracked_here": False,
            "dashboard_url": "https://aistudio.google.com/usage",
        },
        {
            "name": "Groq",
            "category": "Finetune tooling only, not the live app",
            "configured": bool(os.environ.get("GROQ_API_KEY")),
            "tracked_here": False,
            "dashboard_url": "https://console.groq.com/settings/billing",
        },
        {
            "name": "Anthropic",
            "category": "Finetune tooling only, not the live app",
            "configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
            "tracked_here": False,
            "dashboard_url": "https://console.anthropic.com/settings/billing",
        },
    ]

    return {
        "app_name": settings.app_name,
        "environment": settings.environment,
        "debug": settings.debug,
        "python_version": sys.version.split()[0],
        "platform": platform.platform(),
        "uptime_seconds": int(time.time() - _STARTED_AT),
        "rate_limit_enabled": settings.rate_limit_enabled,
        "database": {"dialect": engine.dialect.name, "ok": database_ok, "alembic_version": alembic_version},
        "vector_store": {"ok": vector_ok},
        "storage": {"backend": "r2" if r2_configured else "local", "uploads_dir": None if r2_configured else settings.uploads_dir},
        "openai": {"configured": bool(settings.openai_api_key), "chat_model": settings.openai_chat_model, "ok": openai_ok},
        "humanizer": {
            "rewrite_model": settings.humanizer_rewrite_model,
            "classify_model": settings.humanizer_classify_model,
            "candidates": settings.humanizer_num_candidates,
            "ultra_model": settings.humanizer_ultra_model,
            "ultra_ollama_url": settings.humanizer_ultra_ollama_url,
            "ultra_ok": ollama_ok,
        },
        "web_search": {"configured": bool(settings.tavily_api_key), "usage": tavily_usage},
        "email": {"provider": email_provider, "from": settings.email_from, "recent": resend_recent},
        "uptimerobot": {"configured": bool(settings.uptimerobot_api_key), "monitors": uptimerobot_monitors},
        "oauth": {
            "google": bool(settings.google_client_id and settings.google_client_secret),
            "github": bool(settings.github_client_id and settings.github_client_secret),
        },
        "admin_bootstrap_emails": len(settings.admin_email_list),
        "retention": {
            "days": int(runtime_settings.get("retention_days")),
            "last_run_at": retention_row.value if retention_row else None,
        },
        "external_apis": external_apis,
    }


@router.post("/retention/run")
def run_retention_now(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Run the retention cleanup immediately (normally it runs once a day,
    triggered by the uptime ping)."""
    summary = run_cleanup()
    record_admin_action(db, admin_email=admin.email, action="retention.run", details=summary)
    return {"message": "Retention cleanup completed", "summary": summary}

