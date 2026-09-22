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

# The 6 pages that get their own background: the 5 tool pages, keyed exactly
# like app.api.dependencies.tools.TOOL_SETTING_KEYS / the frontend's
# ROUTE_TOOL (same canonical tool-key set, reused rather than inventing a
# second naming scheme), plus "landing" for the public marketing page, which
# has no tool key of its own.
BACKGROUND_PAGES: tuple[str, ...] = (
    "landing",
    "research_copilot",
    "humanizer",
    "checker",
    "realtime",
    "paper_analyzer",
)


# 2026-09-22: real starting text for the public /privacy and /terms pages,
# grounded in what this app actually does today (checked against the code,
# not invented) — the alternative, shipping blank, meant a live product
# collecting documents/chats/emails with no privacy policy at all. Genuinely
# needs a lawyer's pass before being treated as final (an engineer wrote it,
# and it doesn't know your legal entity's jurisdiction), but it's real,
# accurate boilerplate, not filler — and it's just the default: an admin can
# rewrite either one from Settings → Legal & contact at any time.
_DEFAULT_PRIVACY_POLICY = """Effective date: September 22, 2026.

This policy describes what Querex collects, why, and what you can do about it.

What we collect

Account info: your email address, and if you sign in with Google or GitHub, the name and email those providers share with us. We never see or store your password for those providers.

Content you give us: documents you upload to Research Copilot, the questions you ask and the answers you receive, text you submit to Humanizer, AI Checker, or Paper Analyzer, and your Real-time AI chat history. This content is what the product exists to work with — we don't collect it for any other purpose.

Usage data: which tool you used, when, and whether the request succeeded — kept lean (no content, just the fact that a request happened) so we can keep the product working and see what's actually used.

Technical data: your IP address, used only to apply per-IP rate limits and, at sign-in, to issue a short-lived session cookie. We do not use cookies for advertising or cross-site tracking, and we don't run any analytics or tracking scripts.

How we use it

To run the product: retrieving your documents' relevant passages, generating answers and rewrites, and keeping your account and history working across sessions.

To keep the service reliable and abuse-free: rate limiting, and looking into errors when something breaks.

We do not sell your data, and we do not use your content to train any model without your explicit opt-in (there is none today).

Who else sees it

Processing your requests means some data passes through the providers that power each tool: OpenAI (the language model behind every tool's core answers/rewrites), Tavily (live web search, Real-time AI only), Modal (hosts the Humanizer's optional "Ultra Human" model), Resend (delivers sign-in codes and account emails), Cloudflare R2 (stores your uploaded documents), and Neon (our Postgres database). Each only receives what it needs to do its specific job, under its own privacy terms.

How long we keep it

Documents and chat history are kept according to the retention window an administrator sets (visible in the product); by default this is a matter of days, not indefinite. Deleting your account removes your documents, chat/humanizer/real-time history, and usage records.

Your choices

You can delete individual documents or your whole account at any time from your account settings. You can ask us what data we hold on you or ask us to delete it by emailing the contact address in the footer, when one is configured.

Children

Querex isn't directed at children, and we don't knowingly collect data from anyone under 13.

Changes

If this policy changes in a way that matters, we'll update the date at the top. Continued use after a change means you accept the updated policy.

Contact

Reach us at the email in the footer, when one is configured, or through [your legal entity's contact details — add here]."""

_DEFAULT_TERMS_OF_SERVICE = """Effective date: September 22, 2026.

These are the terms for using Querex — Research Copilot, Humanizer, AI Checker, Real-time AI, and Paper Analyzer, all under one account.

Using the service

You need an account (email sign-in or Google/GitHub) to use any tool. You're responsible for what you upload and submit, and for keeping your account credentials safe. Don't use Querex to process content you don't have the right to share, and don't try to abuse, overload, or reverse-engineer the service — rate limits exist to keep it usable for everyone.

What Querex does and doesn't guarantee

Research Copilot answers are grounded in the documents you upload and cite the page they came from — but they're still generated by a language model and can be wrong; verify anything that matters against the cited source. Humanizer rewrites text to read more naturally without changing its meaning — it's an editing tool, not a guarantee against any specific detector. AI Checker's score is a probability estimate, not a certainty, and can be wrong in both directions. Paper Analyzer measures your document's actual formatting against a style guide, computed from the real page geometry, not guessed by a model. None of these outputs are professional, legal, medical, or academic-integrity advice — you're responsible for how you use them.

Your content

You keep ownership of everything you upload or write. By using Querex you let us process it as needed to run the product (see the Privacy Policy for exactly how and with whom). We don't claim any ownership over your documents or the text you submit.

Availability

We aim to keep Querex running reliably, but don't guarantee uninterrupted access — tools can be temporarily disabled for maintenance, and an administrator can put the whole platform into maintenance mode when needed. We'll try to keep any downtime short.

Account termination

You can delete your account at any time, which removes your documents and history per the Privacy Policy. We can suspend or terminate accounts that abuse the service, violate these terms, or use it for anything illegal.

Changes to these terms

If these terms change in a way that matters, we'll update the effective date above. Continuing to use Querex after a change means you accept the updated terms.

Limitation of liability

Querex is provided "as is." To the extent permitted by law, we aren't liable for indirect, incidental, or consequential damages arising from your use of the service, including reliance on any tool's output.

Governing law

These terms are governed by the laws of [your jurisdiction — add here].

Contact

Reach us at the email in the footer, when one is configured, or through [your legal entity's contact details — add here]."""


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
        # 2026-09-20: whether the marketing landing page links out to the source repo,
        # and where. Off by default's not right either -- open source is a legitimate
        # choice -- but it shouldn't be a silent, unremovable default: an admin should
        # be able to turn it off (e.g. before the repo is public, or if it's ever made
        # private) or repoint it (a different/renamed repo) without a code deploy.
        "github_link_enabled": _bool_setting(
            "Show a GitHub link on the public landing page, pointing at github_repo_url below.",
            "platform",
        ),
        "github_repo_url": SettingDef(
            str, 0, 300, "Repo URL the landing page's GitHub link points to (only shown when the toggle above is on)", "platform"
        ),
        # ── Appearance (per-page background) ──────────────────────────────────
        # 2026-09-20: each of the 6 pages (landing + 5 tools) has its own animated
        # background (SiteBackground / AtmosphereBackground) -- "dynamic" here,
        # the only option that ever existed before this. "static" swaps it for an
        # admin-uploaded image, served from app.api.routes.background (image bytes
        # live in object storage via StorageService, not in this string setting --
        # this only records the mode). Deliberately NOT auto-applied the instant an
        # admin picks "static" in the dropdown: the frontend gates the actual save
        # on an image having been uploaded first, so a page can never go live in
        # "static" mode with nothing to show -- see BackgroundSection in
        # settings-tab.tsx and POST /admin/background/{page}.
        **{
            f"bg_mode_{page}": SettingDef(
                str,
                0,
                10,
                f"Background for the {page.replace('_', ' ')} page: the built-in animated scene, or an uploaded static image.",
                "appearance",
                choices=frozenset({"dynamic", "static"}),
            )
            for page in BACKGROUND_PAGES
        },
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
        # ── Legal & contact ─────────────────────────────────────────────────
        # 2026-09-21: the public footer needs a real Contact address and working
        # Privacy Policy / Terms of Service pages, but the actual support inbox,
        # legal entity name, and document text are all facts only the site owner
        # has — none of that belongs hardcoded or invented in the codebase. These
        # ship with obvious placeholder values (visible as placeholders, not
        # presented as real policy) so the footer/legal pages render something
        # coherent immediately, and an admin fills in the real text here without
        # a code change. GET /app/config (support_email, legal_entity_name) and
        # GET /app/legal/{privacy,terms} (the two content fields) serve these to
        # signed-out visitors — see app_config.py.
        "support_email": SettingDef(
            str, 0, 200, "Contact address shown in the public footer (mailto link)", "legal"
        ),
        "legal_entity_name": SettingDef(
            str, 0, 200, "Legal entity name shown in the footer copyright line and legal pages", "legal"
        ),
        "privacy_policy_content": SettingDef(
            str, 0, 20000, "Privacy Policy page body (plain text, paragraphs separated by blank lines)", "legal"
        ),
        "terms_of_service_content": SettingDef(
            str, 0, 20000, "Terms of Service page body (plain text, paragraphs separated by blank lines)", "legal"
        ),
    }


CATEGORY_LABELS: dict[str, str] = {
    "platform": "Platform",
    "appearance": "Appearance",
    "features": "Feature switches",
    "uploads": "Uploads & retention",
    "research_copilot": "Research Copilot",
    "humanizer": "Humanizer",
    "checker": "AI Checker",
    "realtime": "Real-time AI",
    "extract": "Text extraction",
    "paper_analyzer": "Paper Analyzer",
    "legal": "Legal & contact",
}


def _env_defaults() -> dict[str, SettingValue]:
    s = get_settings()
    return {
        "maintenance_mode": False,
        "signups_enabled": True,
        "announcement_text": "",
        "github_link_enabled": True,
        "github_repo_url": "https://github.com/akhileshwar03/ai-research-copilot",
        **{f"bg_mode_{page}": "dynamic" for page in BACKGROUND_PAGES},
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
        # support_email stays empty by default, same pattern as
        # github_repo_url: the footer renders no Contact link at all rather
        # than a fabricated address — only a real inbox belongs there, and
        # only an admin can supply one. privacy_policy_content and
        # terms_of_service_content, by contrast, ship with real starting text
        # (2026-09-22) describing this app's actual, current data practices —
        # not filler. Have it reviewed by counsel before treating it as final;
        # it's grounded in the real system but written by an engineer, not a
        # lawyer, and doesn't know your legal entity's jurisdiction — both
        # documents leave that one placeholder. Either field stays editable
        # from Settings → Legal & contact, same as always.
        "support_email": "",
        "legal_entity_name": "Querex",
        "privacy_policy_content": _DEFAULT_PRIVACY_POLICY,
        "terms_of_service_content": _DEFAULT_TERMS_OF_SERVICE,
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
