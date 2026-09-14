import logging
import re
import time
import uuid

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.services.runtime_settings import runtime_settings
from app.services.usage_tracking import attach_usage_tracking

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


async def request_context_middleware(request: Request, call_next):
    incoming = request.headers.get("x-request-id")
    request_id = incoming if incoming and _SAFE_REQUEST_ID.match(incoming) else str(uuid.uuid4())
    request.state.request_id = request_id
    started_at = time.perf_counter()
    api_prefix = get_settings().api_v1_prefix

    if _blocked_by_maintenance(request.url.path, api_prefix):
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "MAINTENANCE",
                    "message": "Querex is down for maintenance. Please try again shortly.",
                    "request_id": request_id,
                    "details": {},
                },
                "detail": "Querex is down for maintenance. Please try again shortly.",
            },
            headers={"Retry-After": "300", "x-request-id": request_id},
        )

    response = await call_next(request)
    duration_ms = int((time.perf_counter() - started_at) * 1000)
    response.headers["x-request-id"] = request_id
    attach_usage_tracking(request, response, api_prefix=api_prefix, started_at=started_at)
    logger.info(
        "request_id=%s method=%s path=%s status=%s duration_ms=%s",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response
