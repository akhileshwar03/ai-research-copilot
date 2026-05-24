def test_auth_register_login_and_refresh_legacy_and_v1(client, unique_email):
    register_payload = {"email": unique_email, "password": "StrongPass123"}

    r1 = client.post("/register", json=register_payload)
    r2 = client.post("/api/v1/register", json=register_payload)

    assert r1.status_code == 200
    assert r1.json()["message"] == "User created"
    assert r2.status_code in (200, 400)

    login_legacy = client.post("/login", json=register_payload)
    login_v1 = client.post("/api/v1/login", json=register_payload)

    assert login_legacy.status_code == 200
    assert login_v1.status_code == 200

    body = login_legacy.json()
    assert "token" in body
    assert "access_token" in body
    assert "refresh_token" in body

    refresh_legacy = client.post("/refresh", json={"refresh_token": body["refresh_token"]})
    refresh_v1 = client.post("/api/v1/refresh", json={"refresh_token": body["refresh_token"]})

    assert refresh_legacy.status_code == 200
    assert refresh_v1.status_code == 200
    assert "token" in refresh_legacy.json()
