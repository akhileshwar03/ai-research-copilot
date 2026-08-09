def test_realtime_sessions_crud(client, auth_headers):
    session_payload = {
        "session": {
            "id": 0,
            "title": "My Real-time Chat",
            "pinned": False,
            "messages": [{"role": "user", "content": "Hello"}],
        }
    }

    create = client.post("/api/v1/realtime/sessions", json=session_payload, headers=auth_headers)
    assert create.status_code == 200
    sid = create.json()["id"]
    assert isinstance(sid, int)

    get = client.get("/api/v1/realtime/sessions", headers=auth_headers)
    assert get.status_code == 200
    body = get.json()
    assert "sessions" in body
    assert any(s["id"] == sid for s in body["sessions"])

    update_payload = {
        "session": {
            "id": sid,
            "title": "Renamed",
            "pinned": True,
            "messages": [{"role": "assistant", "content": "Updated", "sources": [{"title": "X", "url": "https://x.com"}]}],
        }
    }
    update = client.put(f"/api/v1/realtime/sessions/{sid}", json=update_payload, headers=auth_headers)
    assert update.status_code == 200

    get2 = client.get("/api/v1/realtime/sessions", headers=auth_headers)
    session = next(s for s in get2.json()["sessions"] if s["id"] == sid)
    assert session["title"] == "Renamed"
    assert session["pinned"] is True
    assert session["messages"][0]["sources"] == [{"title": "X", "url": "https://x.com"}]

    delete = client.delete(f"/api/v1/realtime/sessions/{sid}", headers=auth_headers)
    assert delete.status_code == 200

    get3 = client.get("/api/v1/realtime/sessions", headers=auth_headers)
    assert all(s["id"] != sid for s in get3.json()["sessions"])


def test_realtime_sessions_require_auth(client):
    resp = client.get("/api/v1/realtime/sessions")
    assert resp.status_code == 401


def test_realtime_sessions_isolated_from_chat_sessions(client, auth_headers):
    """A realtime session must not appear in /sessions or vice versa —
    the two products' history is deliberately not shared."""
    chat_payload = {"session": {"id": 0, "title": "Chat one", "pinned": False, "messages": []}}
    client.post("/api/v1/sessions", json=chat_payload, headers=auth_headers)

    realtime_payload = {"session": {"id": 0, "title": "Realtime one", "pinned": False, "messages": []}}
    client.post("/api/v1/realtime/sessions", json=realtime_payload, headers=auth_headers)

    chat_titles = [s["title"] for s in client.get("/api/v1/sessions", headers=auth_headers).json()["sessions"]]
    realtime_titles = [
        s["title"] for s in client.get("/api/v1/realtime/sessions", headers=auth_headers).json()["sessions"]
    ]

    assert "Realtime one" not in chat_titles
    assert "Chat one" not in realtime_titles


def test_realtime_session_ownership_enforced(client, auth_headers, unique_email):
    session_payload = {"session": {"id": 0, "title": "Private", "pinned": False, "messages": []}}
    create = client.post("/api/v1/realtime/sessions", json=session_payload, headers=auth_headers)
    sid = create.json()["id"]

    other_email = f"other-rt-{unique_email}"
    client.post("/api/v1/register", json={"email": other_email, "password": "StrongPass1"})
    login2 = client.post("/api/v1/login", json={"email": other_email, "password": "StrongPass1"})
    token2 = login2.json().get("access_token") or login2.json().get("token")
    other_headers = {"Authorization": f"bearer {token2}"}

    delete_attempt = client.delete(f"/api/v1/realtime/sessions/{sid}", headers=other_headers)
    assert delete_attempt.status_code == 404
