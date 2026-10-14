"""Sentry `before_send` filter: drop errors that are a deliberate operator choice.

Sentry's Starlette integration reports every handled exception that returns a 5xx. A feature the
admin switched off on purpose (Ultra Human backend "off", a per-tool kill switch) answers 503 by
design, so each click on it paged the owner -- found 2026-10-14 when a single test click emailed
PYTHON-FASTAPI-6. Only these explicit codes are dropped; every other 5xx still reports.
"""

from app.core.exceptions import AppError

DELIBERATE_UNAVAILABLE_CODES = frozenset({"ULTRA_DISABLED", "TOOL_DISABLED"})


def drop_deliberate_unavailability(event, hint):
    exc = (hint or {}).get("exc_info", (None, None, None))[1]
    if isinstance(exc, AppError) and exc.code in DELIBERATE_UNAVAILABLE_CODES:
        return None
    return event
