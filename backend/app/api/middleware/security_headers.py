"""Baseline browser-security headers on every API response.

Pure ASGI (not BaseHTTPMiddleware) so it can't interfere with streamed responses (chat, humanizer
SSE). Existing headers are never overwritten, so a route that sets its own (e.g. Cache-Control on
the PDF endpoint) keeps it.

Deliberately NOT included: Content-Security-Policy. This API only returns JSON / PDF bytes / SSE
and never renders HTML, so a CSP here protects nothing, and a wrong one is a classic way to break
a working app. The frontend's own headers are set in frontend/next.config.ts.
"""

_BASE_HEADERS = (
    (b"x-content-type-options", b"nosniff"),  # never let a browser guess a different type
    (b"x-frame-options", b"DENY"),  # nothing here is ever meant to be framed
    (b"referrer-policy", b"no-referrer"),
)
_HSTS = (b"strict-transport-security", b"max-age=31536000; includeSubDomains")


class SecurityHeadersMiddleware:
    def __init__(self, app, hsts: bool = False):
        self.app = app
        self._headers = _BASE_HEADERS + ((_HSTS,) if hsts else ())

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                existing = {name.lower() for name, _ in message.get("headers", [])}
                message["headers"] = list(message.get("headers", [])) + [
                    (n, v) for n, v in self._headers if n not in existing
                ]
            await send(message)

        await self.app(scope, receive, send_with_headers)
