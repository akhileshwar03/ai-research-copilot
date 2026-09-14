"""Contract tests for the only two sign-in paths this app has: email OTP and
OAuth (Google/GitHub). There is no password-based login."""


def test_otp_send_verify_and_refresh(client, unique_email):
    sent = client.post("/api/v1/auth/send-otp", json={"email": unique_email})
    assert sent.status_code == 200
    code = sent.json()["_dev_code"]

    verify = client.post("/api/v1/auth/verify-otp", json={"email": unique_email, "code": code})
    assert verify.status_code == 200
    body = verify.json()
    assert "access_token" in body
    assert "refresh_token" in body

    refresh = client.post("/api/v1/refresh", json={"refresh_token": body["refresh_token"]})
    assert refresh.status_code == 200
    assert "access_token" in refresh.json() or "token" in refresh.json()


def test_otp_verify_rejects_wrong_code(client, unique_email):
    client.post("/api/v1/auth/send-otp", json={"email": unique_email})
    resp = client.post("/api/v1/auth/verify-otp", json={"email": unique_email, "code": "000000"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "OTP_INVALID"


def test_otp_verify_without_pending_code_is_rejected(client, unique_email):
    resp = client.post("/api/v1/auth/verify-otp", json={"email": unique_email, "code": "123456"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "OTP_NOT_FOUND"


def test_oauth_providers_endpoint_does_not_require_auth(client):
    resp = client.get("/api/v1/auth/oauth/providers")
    assert resp.status_code == 200
    body = resp.json()
    assert "google" in body and "github" in body
