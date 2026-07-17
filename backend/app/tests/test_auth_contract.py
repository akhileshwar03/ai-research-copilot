def test_auth_register_login_and_refresh(client, unique_email):
    payload = {"email": unique_email, "password": "StrongPass1"}

    r = client.post("/api/v1/register", json=payload)
    assert r.status_code == 200
    assert r.json()["message"] == "User created"

    # Duplicate registration is rejected.
    r2 = client.post("/api/v1/register", json=payload)
    assert r2.status_code == 400

    login = client.post("/api/v1/login", json=payload)
    assert login.status_code == 200
    body = login.json()
    assert "access_token" in body
    assert "refresh_token" in body

    refresh = client.post("/api/v1/refresh", json={"refresh_token": body["refresh_token"]})
    assert refresh.status_code == 200
    assert "access_token" in refresh.json() or "token" in refresh.json()


def test_register_rejects_weak_password(client, unique_email):
    r = client.post("/api/v1/register", json={"email": unique_email, "password": "weak"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "WEAK_PASSWORD"
