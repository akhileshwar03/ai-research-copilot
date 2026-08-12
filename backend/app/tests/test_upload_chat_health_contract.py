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
