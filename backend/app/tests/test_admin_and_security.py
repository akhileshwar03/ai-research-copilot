"""Contract tests for the admin panel and the security hardening changes:

- admin endpoints reject non-admins and anonymous callers
- admins can view stats, manage users, and adjust runtime settings
- suspended users are locked out of every authenticated endpoint
- OTP verification burns the token after too many failed attempts
- verify-otp enforces the full password policy for new accounts
"""

import uuid

from app.db.models.user import User
from app.tests.conftest import TestingSessionLocal


def _make_admin(email: str) -> None:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        user.is_admin = True
        db.commit()
    finally:
        db.close()


def _register_and_login(client, email: str) -> dict:
    client.post("/api/v1/register", json={"email": email, "password": "StrongPass1"})
    resp = client.post("/api/v1/login", json={"email": email, "password": "StrongPass1"})
    token = resp.json().get("access_token") or resp.json().get("token")
    return {"Authorization": f"bearer {token}"}


# ── Admin access control ───────────────────────────────────────────────────────

def test_admin_endpoints_reject_non_admin(client, auth_headers):
    for path in ["/api/v1/admin/stats", "/api/v1/admin/users", "/api/v1/admin/settings"]:
        resp = client.get(path, headers=auth_headers)
        assert resp.status_code == 403, f"{path} should be admin-only"


def test_admin_endpoints_reject_anonymous(client):
    resp = client.get("/api/v1/admin/stats")
    assert resp.status_code == 401


def test_admin_stats_and_users(client, unique_email):
    headers = _register_and_login(client, unique_email)
    _make_admin(unique_email)

    stats = client.get("/api/v1/admin/stats", headers=headers)
    assert stats.status_code == 200
    body = stats.json()
    assert body["total_users"] >= 1
    assert "total_storage_bytes" in body

    users = client.get(f"/api/v1/admin/users?q={unique_email}", headers=headers)
    assert users.status_code == 200
    listed = users.json()["users"]
    assert any(u["email"] == unique_email and u["is_admin"] for u in listed)


def test_admin_cannot_suspend_self(client, unique_email):
    headers = _register_and_login(client, unique_email)
    _make_admin(unique_email)

    me = client.get(f"/api/v1/admin/users?q={unique_email}", headers=headers).json()["users"][0]
    resp = client.patch(f"/api/v1/admin/users/{me['id']}", json={"is_active": False}, headers=headers)
    assert resp.status_code == 400


def test_admin_can_suspend_and_reinstate_user(client, unique_email):
    admin_headers = _register_and_login(client, unique_email)
    _make_admin(unique_email)

    victim_email = f"victim-{uuid.uuid4().hex[:8]}@example.com"
    victim_headers = _register_and_login(client, victim_email)

    victim = client.get(f"/api/v1/admin/users?q={victim_email}", headers=admin_headers).json()["users"][0]

    # Suspend → victim is locked out everywhere.
    resp = client.patch(f"/api/v1/admin/users/{victim['id']}", json={"is_active": False}, headers=admin_headers)
    assert resp.status_code == 200
    locked = client.get("/api/v1/sessions", headers=victim_headers)
    assert locked.status_code == 403

    # Reinstate → access restored.
    resp = client.patch(f"/api/v1/admin/users/{victim['id']}", json={"is_active": True}, headers=admin_headers)
    assert resp.status_code == 200
    restored = client.get("/api/v1/sessions", headers=victim_headers)
    assert restored.status_code == 200


def test_admin_runtime_settings_roundtrip(client, unique_email):
    headers = _register_and_login(client, unique_email)
    _make_admin(unique_email)

    settings = client.get("/api/v1/admin/settings", headers=headers)
    assert settings.status_code == 200
    keys = {s["key"] for s in settings.json()}
    assert "max_upload_size_mb" in keys
    assert "rag_top_k" in keys

    resp = client.put(
        "/api/v1/admin/settings",
        json={"settings": {"max_upload_size_mb": 5}},
        headers=headers,
    )
    assert resp.status_code == 200
    updated = {s["key"]: s["value"] for s in resp.json()}
    assert updated["max_upload_size_mb"] == 5

    # Out-of-range values are rejected.
    resp = client.put(
        "/api/v1/admin/settings",
        json={"settings": {"max_upload_size_mb": 9999}},
        headers=headers,
    )
    assert resp.status_code == 400


# ── OTP hardening ──────────────────────────────────────────────────────────────

def test_otp_burns_after_max_failed_attempts(client, unique_email):
    send = client.post("/api/v1/auth/send-otp", json={"email": unique_email})
    assert send.status_code == 200

    # 5 wrong guesses exhaust the token...
    for _ in range(5):
        resp = client.post(
            "/api/v1/auth/verify-otp",
            json={"email": unique_email, "code": "000000", "password": "StrongPass1"},
        )
        assert resp.status_code in (400, 429)

    # ...after which even the *correct* code path is dead (token burned):
    resp = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": unique_email, "code": "000000", "password": "StrongPass1"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] in ("OTP_NOT_FOUND", "OTP_TOO_MANY_ATTEMPTS")


def test_verify_otp_rejects_weak_password_for_new_account(client, unique_email):
    send = client.post("/api/v1/auth/send-otp", json={"email": unique_email})
    assert send.status_code == 200
    dev_code = send.json().get("_dev_code")
    assert dev_code, "dev mode should return the OTP code"

    resp = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": unique_email, "code": dev_code, "password": "weak"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "WEAK_PASSWORD"


# ── Document file serving ──────────────────────────────────────────────────────

def test_uploads_static_mount_is_gone(client):
    resp = client.get("/uploads/anything.pdf")
    assert resp.status_code in (401, 404)  # must NOT serve files anonymously


def test_auth_me_returns_admin_flag(client, unique_email):
    headers = _register_and_login(client, unique_email)
    resp = client.get("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == unique_email
    assert body["is_admin"] is False
