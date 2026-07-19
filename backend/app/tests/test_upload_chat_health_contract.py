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


def test_health_and_readiness(client):
    for path in ["/health", "/api/v1/health"]:
        r = client.get(path)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    for path in ["/readiness", "/api/v1/readiness"]:
        r = client.get(path)
        assert r.status_code == 200
        assert "checks" in r.json()
