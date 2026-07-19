def test_sessions_crud(client, auth_headers):
    session_payload = {
        "session": {
            "id": 0,
            "title": "My Research Session",
            "pinned": False,
            "messages": [{"role": "user", "content": "Hello"}],
        }
    }

    # Create
    create = client.post("/api/v1/sessions", json=session_payload, headers=auth_headers)
    assert create.status_code == 200
    sid = create.json()["id"]
    assert isinstance(sid, int)

    # List — response now includes total/skip/limit
    get = client.get("/api/v1/sessions", headers=auth_headers)
    assert get.status_code == 200
    body = get.json()
    assert "sessions" in body
    assert "total" in body
    assert any(s["id"] == sid for s in body["sessions"])

    # Update
    update_payload = {
        "session": {
            "id": sid,
            "title": "Renamed",
            "pinned": True,
            "messages": [{"role": "assistant", "content": "Updated"}],
        }
    }
    update = client.put(f"/api/v1/sessions/{sid}", json=update_payload, headers=auth_headers)
    assert update.status_code == 200

    # Delete
    delete = client.delete(f"/api/v1/sessions/{sid}", headers=auth_headers)
    assert delete.status_code == 200

    # Confirm gone
    get2 = client.get("/api/v1/sessions", headers=auth_headers)
    assert all(s["id"] != sid for s in get2.json()["sessions"])


def test_session_document_ids_round_trip(client, auth_headers):
    """A session's compare-document selection persists across create, list, and update."""
    create_payload = {
        "session": {
            "id": 0,
            "title": "Compare A vs B",
            "pinned": False,
            "messages": [],
            "document_ids": ["doc-a.pdf", "doc-b.pdf"],
        }
    }
    create = client.post("/api/v1/sessions", json=create_payload, headers=auth_headers)
    assert create.status_code == 200
    sid = create.json()["id"]

    get = client.get("/api/v1/sessions", headers=auth_headers)
    session = next(s for s in get.json()["sessions"] if s["id"] == sid)
    assert session["document_ids"] == ["doc-a.pdf", "doc-b.pdf"]

    # Update to a different set — e.g. swapping in doc-c for doc-b.
    update_payload = {
        "session": {
            "id": sid,
            "title": "Compare A vs B",
            "pinned": False,
            "messages": [],
            "document_ids": ["doc-a.pdf", "doc-c.pdf"],
        }
    }
    update = client.put(f"/api/v1/sessions/{sid}", json=update_payload, headers=auth_headers)
    assert update.status_code == 200

    get2 = client.get("/api/v1/sessions", headers=auth_headers)
    session2 = next(s for s in get2.json()["sessions"] if s["id"] == sid)
    assert session2["document_ids"] == ["doc-a.pdf", "doc-c.pdf"]


def test_message_sources_persist_across_reload(client, auth_headers):
    """A citation chip's source string must survive a fresh GET, not just live in memory."""
    session_payload = {
        "session": {
            "id": 0,
            "title": "Cited chat",
            "pinned": False,
            "messages": [
                {"role": "user", "content": "What changed?"},
                {"role": "assistant", "content": "Revenue grew.", "sources": "Q3-Report.pdf"},
            ],
        }
    }
    create = client.post("/api/v1/sessions", json=session_payload, headers=auth_headers)
    sid = create.json()["id"]

    get = client.get("/api/v1/sessions", headers=auth_headers)
    session = next(s for s in get.json()["sessions"] if s["id"] == sid)
    assert session["messages"][0]["sources"] is None
    assert session["messages"][1]["sources"] == "Q3-Report.pdf"


def test_session_ownership_enforced(client, auth_headers, unique_email):
    """A session owned by one user cannot be modified by another."""
    session_payload = {
        "session": {"id": 0, "title": "Private", "pinned": False, "messages": []}
    }
    create = client.post("/api/v1/sessions", json=session_payload, headers=auth_headers)
    sid = create.json()["id"]

    # Create a second user and get their headers.
    other_email = f"other-{unique_email}"
    client.post("/api/v1/register", json={"email": other_email, "password": "StrongPass1"})
    login2 = client.post("/api/v1/login", json={"email": other_email, "password": "StrongPass1"})
    token2 = login2.json().get("access_token") or login2.json().get("token")
    other_headers = {"Authorization": f"bearer {token2}"}

    # Other user should not be able to delete or update.
    delete_attempt = client.delete(f"/api/v1/sessions/{sid}", headers=other_headers)
    assert delete_attempt.status_code == 404
