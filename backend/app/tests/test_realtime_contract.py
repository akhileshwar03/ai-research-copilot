def test_realtime_chat_requires_auth(client):
    resp = client.post("/api/v1/realtime/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert resp.status_code == 401


def test_realtime_chat_streams_sse_with_sources(client, auth_headers):
    payload = {"messages": [{"role": "user", "content": "what's happening today"}]}
    resp = client.post("/api/v1/realtime/chat", json=payload, headers=auth_headers)

    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers.get("content-type", "")

    text = resp.text
    assert "event: sources" in text
    assert "https://example.com" in text  # FakeRealtimeService's fake source url
    assert 'data: "real"' in text
    assert "event: done" in text


def test_realtime_chat_rejects_missing_messages(client, auth_headers):
    resp = client.post("/api/v1/realtime/chat", json={}, headers=auth_headers)
    assert resp.status_code == 422
