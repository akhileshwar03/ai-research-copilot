def test_sessions_contract_legacy_and_v1(client, unique_email):
    payload = {"email": unique_email, "password": "StrongPass123"}
    client.post("/register", json=payload)

    session_payload = {
        "email": unique_email,
        "session": {
            "id": 1,
            "title": "New Session",
            "pinned": False,
            "messages": [{"role": "user", "content": "Hello"}],
        },
    }

    create_legacy = client.post("/sessions", json=session_payload)
    create_v1 = client.post("/api/v1/sessions", json=session_payload)

    assert create_legacy.status_code == 200
    assert create_v1.status_code == 200
    sid = create_legacy.json()["id"]

    get_legacy = client.get(f"/sessions/{unique_email}")
    get_v1 = client.get(f"/api/v1/sessions/{unique_email}")
    assert get_legacy.status_code == 200
    assert get_v1.status_code == 200
    assert isinstance(get_legacy.json(), list)

    update_payload = {
        "email": unique_email,
        "session": {
            "id": sid,
            "title": "Renamed",
            "pinned": False,
            "messages": [{"role": "assistant", "content": "Updated"}],
        },
    }
    assert client.put(f"/sessions/{sid}", json=update_payload).status_code == 200
    assert client.put(f"/api/v1/sessions/{sid}", json=update_payload).status_code == 200

    assert client.delete(f"/sessions/{sid}").status_code == 200
