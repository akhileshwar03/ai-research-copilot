"""Request-scoped context: request IDs, access logging, maintenance mode,
and per-tool usage tracking.

Implemented as a plain ASGI middleware (not `@app.middleware("http")` /
`BaseHTTPMiddleware`) deliberately. BaseHTTPMiddleware runs the downstream
app in a separate task inside its own task group, streaming the response
back through a memory channel — for a streaming response (chat, realtime)
that creates a real race: code running "after `call_next()`" in that style
of middleware is not guaranteed to run after the downstream app has fully
finished its own cleanup (dependency teardown, background tasks), only
after the *last body chunk* has been observed. That gap intermittently hit
the usage-tracking write when it lived there — it isn't just a test-only
artifact, it means the write's timing relative to the request that
triggered it is *inherently unsynchronized*. Wrapping `send` here instead
keeps everything in one coroutine: `self.app(...)` does not return until
the downstream app, all its dependency teardown, and any of its own
background tasks have completely finished, so the code after that await is
guaranteed to run strictly after the request is done, every time.
"""

import logging
import re
import time
import uuid

from starlette.concurrency import run_in_threadpool
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import get_settings
from app.services.runtime_settings import runtime_settings
from app.services.usage_tracking import record_usage_event, tool_for_request

logger = logging.getLogger("app.request")

# Client-supplied request IDs are echoed into log lines and response headers, so they
# must be sanitized first — otherwise a caller can inject newlines/control characters
# to forge fake log entries, or send an arbitrarily long value to pad log volume.
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")

# Paths that keep working in maintenance mode: sign-in, token refresh, the
# admin panel itself, the public config the frontend reads to *show* the
# maintenance notice, and the health probes.
_MAINTENANCE_ALLOWED_PREFIXES = (
    "/auth",
    "/refresh",
    "/admin",
    "/app/config",
    "/health",
    "/readiness",
)


def _blocked_by_maintenance(path: str, api_prefix: str) -> bool:
    if not path.startswith(api_prefix):
        return False  # OAuth callbacks at root, /docs, /health
    rest = path[len(api_prefix):]
    if any(rest == p or rest.startswith(p + "/") or rest.startswith(p + "?") for p in _MAINTENANCE_ALLOWED_PREFIXES):
        return False
    try:
        return bool(runtime_settings.get("maintenance_mode"))
    except Exception:
        return False


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key == name:
            return value.decode("latin-1")
    return None


async def _send_maintenance_response(send: Send, request_id: str) -> None:
    import json

    payload = json.dumps(
        {
            "error": {
                "code": "MAINTENANCE",
                "message": "Querex is down for maintenance. Please try again shortly.",
                "request_id": request_id,
                "details": {},
            },
            "detail": "Querex is down for maintenance. Please try again shortly.",
        }
    ).encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": 503,
            "headers": [
                (b"content-type", b"application/json"),
                (b"retry-after", b"300"),
                (b"x-request-id", request_id.encode("latin-1")),
            ],
        }
    )
    await send({"type": "http.response.body", "body": payload, "more_body": False})


class RequestContextMiddleware:
    """Assigns a request id, enforces maintenance mode, logs completion, and
    records a usage event for tool routes — all strictly after the
    downstream app has fully finished handling the request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = _header(scope, b"x-request-id")
        request_id = incoming if incoming and _SAFE_REQUEST_ID.match(incoming) else str(uuid.uuid4())

        # Shared with the rest of the request via Starlette's Request.state,
        # which is backed by this exact dict.
        state = scope.setdefault("state", {})
        state["request_id"] = request_id

        method = scope.get("method", "GET")
        path = scope.get("path", "")
        api_prefix = get_settings().api_v1_prefix

        if _blocked_by_maintenance(path, api_prefix):
            await _send_maintenance_response(send, request_id)
            return

        started_at = time.perf_counter()
        status_holder: dict[str, int] = {}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_wrapper)

        duration_ms = int((time.perf_counter() - started_at) * 1000)
        status_code = status_holder.get("status", 0)
        logger.info(
            "request_id=%s method=%s path=%s status=%s duration_ms=%s",
            request_id,
            method,
            path,
            status_code,
            duration_ms,
        )

        tool = tool_for_request(method, path, api_prefix)
        if tool is not None:
            # A lean DB insert — off the event loop, but only after the
            # response is fully sent, so it never adds latency the client
            # can observe.
            await run_in_threadpool(
                record_usage_event,
                tool=tool,
                user_id=state.get("user_id"),
                status_code=status_code,
                started_at=started_at,
                request_id=request_id,
            )
