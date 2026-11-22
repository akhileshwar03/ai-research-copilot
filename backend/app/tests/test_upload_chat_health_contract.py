import json
from io import BytesIO


def test_upload_returns_202_with_document_id(client, auth_headers):
    files = {"file": ("demo.pdf", BytesIO(b"%PDF-1.4\n%%EOF"), "application/pdf")}
    resp = client.post("/api/v1/upload", files=files, headers=auth_headers)

    assert resp.status_code == 202
    body = resp.json()
    assert "document_id" in body
    assert body["upload_status"] in ("processing", "ready")


def test_documents_list_is_paginated(client, auth_headers):
    resp = client.get("/api/v1/documents?skip=0&limit=10", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "documents" in body
    assert "total" in body
    assert "skip" in body
    assert "limit" in body


def test_documents_list_includes_real_page_count(client, auth_headers):
    """page_count (the PDF's real total, captured at ingestion) must flow
    through the list endpoint — it's what the chat prompt eventually cites
    with confidence instead of a hedged "at least N pages indexed"."""
    resp = client.get("/api/v1/documents", headers=auth_headers)
    assert resp.status_code == 200
    doc = next(d for d in resp.json()["documents"] if d["id"] == "seed.pdf")
    assert doc["page_count"] == 12


def test_chat_streaming_uses_sse_format(client, auth_headers):
    payload = {"messages": [{"role": "user", "content": "hi"}], "document_ids": None}
    resp = client.post("/api/v1/chat", json=payload, headers=auth_headers)

    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers.get("content-type", "")

    # The body should contain SSE-encoded tokens plus a sources event.
    # FakeChatService emits a sources frame first, then "hello", " ", "world".
    text = resp.text
    assert 'data: "hello"' in text
    assert "event: sources" in text
    assert "event: done" in text

    # Reconstruct the streamed message from SSE frames, honouring event names:
    # only unnamed frames carry LLM tokens.
    tokens = []
    sources = None
    for frame in text.split("\n\n"):
        event_name = ""
        data = ""
        for line in frame.split("\n"):
            if line.startswith("event: "):
                event_name = line[7:].strip()
            elif line.startswith("data: "):
                data = line[6:]
        if not data:
            continue
        if event_name == "sources":
            sources = json.loads(data)
        elif event_name == "":
            tokens.append(json.loads(data))

    assert "".join(tokens) == "hello world"
    assert sources == ["seed.pdf"]


def test_document_file_streams_bytes_not_a_redirect(client, auth_headers):
    """Regression test: this route used to redirect to a presigned R2 URL on
    R2 storage, which broke PDF viewing entirely because the bucket has no
    CORS policy — the browser's fetch().blob() call was silently blocked.
    It must now always stream bytes directly, same-origin, no redirect."""
    resp = client.get("/api/v1/documents/seed.pdf/file", headers=auth_headers, follow_redirects=False)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")


def test_document_file_is_cached_long_term_as_a_private_immutable_resource(client, auth_headers):
    """A document's bytes at a given stored_filename never change after upload (re-ingest
    re-runs extraction on the same stored file, never overwrites it), so the browser should
    never have to re-fetch the same document's PDF from network every time the side panel
    reopens it. "private" (not "public") since this is still an access-token-gated response --
    a shared/proxy cache must never store it."""
    resp = client.get("/api/v1/documents/seed.pdf/file", headers=auth_headers, follow_redirects=False)
    assert resp.headers["cache-control"] == "private, max-age=31536000, immutable"


def test_document_file_404s_for_unknown_document(client, auth_headers):
    resp = client.get("/api/v1/documents/does-not-exist.pdf/file", headers=auth_headers)
    assert resp.status_code == 404


def test_document_pin_round_trips_and_reflects_in_list(client, auth_headers):
    resp = client.patch("/api/v1/documents/seed.pdf/pin", json={"pinned": True}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"id": "seed.pdf", "pinned": True}

    listing = client.get("/api/v1/documents", headers=auth_headers).json()
    doc = next(d for d in listing["documents"] if d["id"] == "seed.pdf")
    assert doc["pinned"] is True

    # Unpin round-trips too.
    resp = client.patch("/api/v1/documents/seed.pdf/pin", json={"pinned": False}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["pinned"] is False


def test_document_pin_404s_for_unknown_document(client, auth_headers):
    resp = client.patch("/api/v1/documents/does-not-exist.pdf/pin", json={"pinned": True}, headers=auth_headers)
    assert resp.status_code == 404


def test_health_and_readiness(client):
    for path in ["/health", "/api/v1/health"]:
        r = client.get(path)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    for path in ["/readiness", "/api/v1/readiness"]:
        r = client.get(path)
        assert r.status_code == 200
        assert "checks" in r.json()


def _real_health_service():
    """The real HealthService (not the test suite's FakeHealthService), with simple always-ok
    vector_store/ai_service stand-ins, so only the checker's behavior is under test here."""
    from types import SimpleNamespace

    from app.services.health_service import HealthService

    return HealthService(
        vector_store=SimpleNamespace(ping=lambda: True),
        ai_service=SimpleNamespace(ping=lambda: True),
    )


def test_readiness_checker_not_configured_counts_as_healthy(client):
    from app.api.dependencies import services as service_deps
    from app.main import app

    app.dependency_overrides[service_deps.get_health_service] = _real_health_service
    try:
        # In dev/test, the checker is deliberately unconfigured -- that must not look like an outage.
        for path in ["/readiness", "/api/v1/readiness"]:
            r = client.get(path)
            assert r.status_code == 200
            assert r.json()["checks"]["checker"] == {"ok": True, "configured": False}
    finally:
        del app.dependency_overrides[service_deps.get_health_service]


def test_readiness_returns_503_when_checker_configured_but_unreachable(client, monkeypatch):
    from types import SimpleNamespace

    from app.api.dependencies import services as service_deps
    from app.main import app
    from app.services import checker_service as cs

    monkeypatch.setattr(
        cs,
        "get_settings",
        lambda: SimpleNamespace(
            checker_url="https://checker.example.test",
            checker_token="t" * 40,
            cf_access_client_id="id",
            cf_access_client_secret="secret",
        ),
    )

    def boom(url, headers, timeout):
        raise Exception("connection refused")

    monkeypatch.setattr(cs.httpx, "get", boom)

    app.dependency_overrides[service_deps.get_health_service] = _real_health_service
    try:
        for path in ["/readiness", "/api/v1/readiness"]:
            r = client.get(path)
            assert r.status_code == 503
            body = r.json()
            assert body["status"] == "degraded"
            assert body["checks"]["checker"] == {"ok": False, "configured": True}
            # the other checks are unaffected -- only the checker is down
            assert body["checks"]["database"]["ok"] is True
    finally:
        del app.dependency_overrides[service_deps.get_health_service]


def test_checker_health_endpoint(client, monkeypatch):
    from types import SimpleNamespace

    from app.services import checker_service as cs

    # Unconfigured (dev/test): healthy, and it must not touch the network.
    r = client.get("/health/checker")
    assert r.status_code == 200 and r.json() == {"status": "ok", "configured": False}

    monkeypatch.setattr(
        cs, "get_settings",
        lambda: SimpleNamespace(checker_url="https://checker.example.test", checker_token="t" * 40,
                                cf_access_client_id="id", cf_access_client_secret="secret"),
    )
    monkeypatch.setattr(cs.httpx, "get", lambda url, headers, timeout: (_ for _ in ()).throw(Exception("down")))
    r = client.get("/health/checker")
    assert r.status_code == 503 and r.json() == {"status": "down", "configured": True}
    assert client.head("/health/checker").status_code == 503

    import httpx
    monkeypatch.setattr(cs.httpx, "get", lambda url, headers, timeout: httpx.Response(200, json={"ok": True}, request=httpx.Request("GET", url)))
    assert client.get("/health/checker").status_code == 200
