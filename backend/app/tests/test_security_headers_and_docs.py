"""Production must not publish the API map (/docs, /redoc, /openapi.json)."""

from app.main import _docs_kwargs


def test_docs_and_openapi_are_disabled_outside_development():
    assert _docs_kwargs(is_development=False) == {"docs_url": None, "redoc_url": None, "openapi_url": None}


def test_docs_stay_available_in_development():
    assert _docs_kwargs(is_development=True) == {}


def test_api_responses_carry_baseline_security_headers(client):
    resp = client.get("/api/v1/health")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"
    assert resp.headers["referrer-policy"] == "no-referrer"


def test_security_headers_never_overwrite_a_route_set_header():
    import asyncio

    from app.api.middleware.security_headers import SecurityHeadersMiddleware

    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": [(b"x-frame-options", b"SAMEORIGIN")]})
        await send({"type": "http.response.body", "body": b""})

    sent = []

    async def capture(message):
        sent.append(message)

    asyncio.run(SecurityHeadersMiddleware(app, hsts=True)({"type": "http"}, None, capture))
    headers = dict(sent[0]["headers"])
    assert headers[b"x-frame-options"] == b"SAMEORIGIN"  # kept, not replaced
    assert headers[b"x-content-type-options"] == b"nosniff"
    assert b"strict-transport-security" in headers


def test_placeholder_jwt_secret_stops_a_production_start():
    import pytest

    from app.main import check_jwt_secret

    for bad in ("change-me", "CHANGE-ME", " secret "):
        with pytest.raises(RuntimeError):
            check_jwt_secret(bad, is_development=False)


def test_placeholder_jwt_secret_is_tolerated_in_development_and_real_secrets_pass_everywhere():
    from app.main import check_jwt_secret

    check_jwt_secret("change-me", is_development=True)  # local dev: warning only
    check_jwt_secret("a-long-random-production-secret-value", is_development=False)
    check_jwt_secret("short-but-real", is_development=False)  # length is not enforced


def test_health_answers_head_as_well_as_get(client):
    # Uptime monitors / keep-alive pingers probe with HEAD; a 405 counts as a failed check for them.
    assert client.get("/health").status_code == 200
    head = client.head("/health")
    assert head.status_code == 200
    assert head.content == b""
