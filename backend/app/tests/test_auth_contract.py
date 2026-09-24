"""Contract tests for the only two sign-in paths this app has: email OTP and
OAuth (Google/GitHub). There is no password-based login."""

from app.db.models.otp import OtpToken


def test_otp_code_never_stored_in_plaintext(client, unique_email, db_session):
    sent = client.post("/api/v1/auth/send-otp", json={"email": unique_email})
    plaintext_code = sent.json()["_dev_code"]

    token = db_session.query(OtpToken).filter(OtpToken.email == unique_email).order_by(OtpToken.id.desc()).first()
    assert token is not None
    assert token.code_hash != plaintext_code
    assert plaintext_code not in token.code_hash

    # The hash must still be the *right* hash -- verifying with the real code
    # should succeed, proving this isn't just a hash of something else.
    verify = client.post("/api/v1/auth/verify-otp", json={"email": unique_email, "code": plaintext_code})
    assert verify.status_code == 200


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
