"""Contract tests for the httpOnly-cookie refresh flow and the DB-backed
one-time code store."""

from app.tests.conftest import TestingSessionLocal


def _login(client, email: str):
    client.post("/api/v1/register", json={"email": email, "password": "StrongPass1"})
    return client.post("/api/v1/login", json={"email": email, "password": "StrongPass1"})


# ── Refresh via httpOnly cookie ────────────────────────────────────────────────

def test_login_sets_httponly_refresh_cookie(client, unique_email):
    resp = _login(client, unique_email)
    assert resp.status_code == 200

    set_cookie = resp.headers.get("set-cookie", "")
    assert "refresh_token=" in set_cookie
    assert "HttpOnly" in set_cookie


def test_refresh_works_with_cookie_only(client, unique_email):
    _login(client, unique_email)  # TestClient keeps the cookie jar

    # Empty body: the cookie alone must be enough.
    resp = client.post("/api/v1/refresh", json={})
    assert resp.status_code == 200
    assert resp.json().get("access_token")


def test_refresh_works_with_body_token_fallback(client, unique_email):
    login_resp = _login(client, unique_email)
    refresh_token = login_resp.json()["refresh_token"]

    client.cookies.clear()  # simulate Safari blocking the cross-site cookie
    resp = client.post("/api/v1/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert resp.json().get("access_token")


def test_refresh_without_any_token_is_401(client):
    client.cookies.clear()
    resp = client.post("/api/v1/refresh", json={})
    assert resp.status_code == 401


def test_refresh_with_garbage_token_is_401_not_500(client):
    client.cookies.clear()
    resp = client.post("/api/v1/refresh", json={"refresh_token": "not-a-jwt"})
    assert resp.status_code == 401


def test_logout_revokes_refresh_token(client, unique_email):
    login_resp = _login(client, unique_email)
    refresh_token = login_resp.json()["refresh_token"]

    resp = client.post("/api/v1/auth/logout", json={})
    assert resp.status_code == 200

    # The revoked token must no longer refresh (cookie was cleared too, so
    # present it explicitly in the body).
    client.cookies.clear()
    resp = client.post("/api/v1/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 401


# ── One-time code store ────────────────────────────────────────────────────────

def test_one_time_code_is_single_use():
    from app.services import one_time_code_store as otc

    db = TestingSessionLocal()
    try:
        code = otc.create_code(db, otc.PURPOSE_OAUTH_EXCHANGE, {"hello": "world"}, ttl_seconds=60)

        first = otc.consume_code(db, otc.PURPOSE_OAUTH_EXCHANGE, code)
        assert first == {"hello": "world"}

        second = otc.consume_code(db, otc.PURPOSE_OAUTH_EXCHANGE, code)
        assert second is None
    finally:
        db.close()


def test_one_time_code_wrong_purpose_rejected():
    from app.services import one_time_code_store as otc

    db = TestingSessionLocal()
    try:
        code = otc.create_code(db, otc.PURPOSE_OAUTH_STATE, None, ttl_seconds=60)
        assert otc.consume_code(db, otc.PURPOSE_OAUTH_EXCHANGE, code) is None
        assert otc.consume_code(db, otc.PURPOSE_OAUTH_STATE, code) == {}
    finally:
        db.close()


def test_account_denylist_roundtrip():
    from app.services import one_time_code_store as otc

    db = TestingSessionLocal()
    try:
        email = "denied@example.com"
        assert otc.is_account_denied(db, email) is False
        otc.deny_account(db, email, ttl_seconds=60)
        assert otc.is_account_denied(db, email) is True
        assert otc.is_account_denied(db, "Denied@Example.com") is True  # case-insensitive
    finally:
        db.close()
