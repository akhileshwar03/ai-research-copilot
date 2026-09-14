"""Per-request usage tracking for the tool endpoints.

Every request to a tool endpoint (chat, humanizer, checker, ...) is recorded
as one lean ``usage_events`` row — tool name, HTTP status, latency, and the
user (when authenticated). Nothing about the request content is stored.

``record_usage_event`` is called by ``RequestContextMiddleware`` strictly
after the downstream ASGI app has fully finished handling the request (see
that module's docstring for why it deliberately isn't a Starlette
``BackgroundTask`` — that pattern raced against streaming responses). So
latency here reflects the full response time, including a streamed chat
reply's complete generation, and the write can never delay the response
since it only runs once the client has already received everything.
"""

import logging
import time

logger = logging.getLogger(__name__)

# (method, exact path under the API prefix) -> tool name. Deliberately a
# fixed allowlist, not "everything under /api/v1": list/status/polling
# endpoints would otherwise dominate the counts and make the analytics
# meaningless.
TOOL_ROUTES: dict[tuple[str, str], str] = {
    ("POST", "/chat"): "research_copilot",
    ("POST", "/upload"): "upload",
    ("POST", "/humanize"): "humanizer",
    ("POST", "/humanize/ultra"): "humanizer_ultra",
    ("POST", "/checker/text"): "checker",
    ("POST", "/checker/document"): "checker",
    ("POST", "/checker/feedback"): "writing_feedback",
    ("POST", "/realtime/chat"): "realtime",
    ("POST", "/extract/url"): "extract",
    ("POST", "/extract/image"): "extract",
    ("POST", "/paper-analyzer/analyze"): "paper_analyzer",
}

TOOL_LABELS: dict[str, str] = {
    "research_copilot": "Research Copilot",
    "upload": "Document upload",
    "humanizer": "Humanizer",
    "humanizer_ultra": "Humanizer (Ultra)",
    "checker": "AI Checker",
    "writing_feedback": "Writing Feedback",
    "realtime": "Real-time AI",
    "extract": "Text extraction",
    "paper_analyzer": "Paper Analyzer",
}


def tool_for_request(method: str, path: str, api_prefix: str) -> str | None:
    if not path.startswith(api_prefix):
        return None
    return TOOL_ROUTES.get((method.upper(), path[len(api_prefix):]))


def record_usage_event(
    *,
    tool: str,
    user_id: int | None,
    status_code: int,
    started_at: float,
    request_id: str | None,
) -> None:
    """Insert one usage row. Opens its own session, never raises."""
    from app.db.models.usage_event import UsageEvent
    from app.db.session import SessionLocal

    duration_ms = int((time.perf_counter() - started_at) * 1000)
    db = SessionLocal()
    try:
        db.add(
            UsageEvent(
                tool=tool,
                user_id=user_id,
                status_code=status_code,
                ok=status_code < 400,
                duration_ms=duration_ms,
                request_id=request_id,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        # Analytics must never break a request; the table may also not exist
        # yet on a pre-migration boot.
        logger.debug("usage_event_write_failed tool=%s", tool, exc_info=True)
    finally:
        db.close()
