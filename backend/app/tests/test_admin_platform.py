"""Contract tests for the production admin surface added in September 2026:

- public /app/config exposes only tool switches, sign-up state, maintenance
  state and the announcement banner
- per-tool kill switches turn a tool's endpoints into a clear 503
- maintenance mode blocks tool traffic while auth + admin keep working
- closed sign-ups reject brand-new emails but not existing accounts
- every tool request is recorded as a lean usage event with the user id
- analytics, documents, audit log, usage events, system info, CSV export,
  session revocation and per-user activity all answer for an admin
- research actions run over the whole document set and emit follow-ups
- account deletion purges humanizer runs and usage events (PostgreSQL FKs)
"""

import asyncio
import io
import json
from unittest.mock import MagicMock

import pytest

from app.db import session as db_session_module
from app.db.models.admin_audit_log import AdminAuditLog
from app.db.models.chat_models import ChatMessage, ChatSession
from app.db.models.document import Document
from app.db.models.humanizer_run import HumanizerRun
from app.db.models.usage_event import UsageEvent
from app.db.models.user import User
from app.services.chat_service import RESEARCH_ACTIONS, ChatService
from app.services.runtime_settings import BACKGROUND_PAGES, runtime_settings
from app.tests.conftest import TestingSessionLocal
from app.tests.test_admin_and_security import _make_admin, _register_and_login
import app.api.middleware.request_context as request_context_module


def _set(key, value):
    db = TestingSessionLocal()
    try:
        runtime_settings.set(db, key, value)
    finally:
        db.close()


@pytest.fixture
def admin_headers(client, unique_email):
    headers = _register_and_login(client, unique_email)
    _make_admin(unique_email)
    return headers


@pytest.fixture
def track_usage(monkeypatch):
    """Usage rows are written through app.db.session.SessionLocal (the real
    engine); point it at the test database so the rows are observable."""
    monkeypatch.setattr(db_session_module, "SessionLocal", TestingSessionLocal)


# ── Public config ──────────────────────────────────────────────────────────────

def test_public_app_config_is_unauthenticated_and_minimal(client):
    resp = client.get("/api/v1/app/config")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["tools"]) == {
        "research_copilot", "humanizer", "checker", "realtime", "paper_analyzer", "extract",
    }
    assert all(body["tools"].values())
    assert body["signups_enabled"] is True
    assert body["maintenance_mode"] is False
    assert body["announcement"] == ""
    assert body["github_link_enabled"] is True
    assert body["github_repo_url"] == "https://github.com/akhileshwar03/ai-research-copilot"
    assert set(body["backgrounds"]) == set(BACKGROUND_PAGES)
    assert all(bg["mode"] == "dynamic" and bg["image_url"] is None for bg in body["backgrounds"].values())
    # Nothing that only an admin should see leaks out.
    assert "rag_similarity_threshold" not in json.dumps(body)


def test_github_link_toggle_round_trips_to_public_config(client, admin_headers):
    resp = client.put(
        "/api/v1/admin/settings",
        headers=admin_headers,
        json={"settings": {"github_link_enabled": False, "github_repo_url": "https://github.com/someorg/somerepo"}},
    )
    assert resp.status_code == 200
    try:
        body = client.get("/api/v1/app/config").json()
        assert body["github_link_enabled"] is False
        assert body["github_repo_url"] == "https://github.com/someorg/somerepo"
    finally:
        _set("github_link_enabled", True)
        _set("github_repo_url", "https://github.com/akhileshwar03/ai-research-copilot")


# ── Per-page background images ───────────────────────────────────────────────────

@pytest.fixture
def fake_bg_storage(monkeypatch, tmp_path):
    """Routes the background-image upload/serve routes at a throwaway local
    directory instead of real R2 -- both admin.py and app_config.py bind
    `get_storage_service` directly (`from ... import get_storage_service`),
    so each module's own reference has to be patched individually; patching
    only the origin module (as test_retention.py does for a module that
    calls it qualified) would silently miss these two.

    Real bug this fixture used to have, caught by CI (2026-09-20): the
    storage-usage endpoint's own "is R2 configured" check reads
    settings.r2_account_id etc. directly, which this fixture never touched --
    it passed locally only because a real backend/.env with real R2
    credentials happens to sit on that one machine, and failed on CI, which
    has none. A test must not depend on which machine's real environment
    happens to run it; explicitly setting these here makes the "configured"
    check pass deterministically everywhere, not by accident on just one box."""
    from app.core.config import get_settings
    from app.services.storage_service import LocalStorageService
    import app.api.routes.admin as admin_module
    import app.api.routes.app_config as app_config_module

    settings = get_settings()
    monkeypatch.setattr(settings, "r2_account_id", "test-account")
    monkeypatch.setattr(settings, "r2_access_key_id", "test-key")
    monkeypatch.setattr(settings, "r2_secret_access_key", "test-secret")
    monkeypatch.setattr(settings, "r2_bucket_name", "test-bucket")

    fake_storage = LocalStorageService(base_dir=str(tmp_path))
    monkeypatch.setattr(admin_module, "get_storage_service", lambda: fake_storage)
    monkeypatch.setattr(app_config_module, "get_storage_service", lambda: fake_storage)
    return fake_storage


def _test_png(color=(220, 30, 30), size=(300, 300)) -> bytes:
    """A real, fully decodable PNG (not hand-rolled bytes) -- needed now that
    uploads are actually opened and re-encoded by Pillow, not just stored
    and served back verbatim. 300x300 solid color is enough to exercise real
    compression (still trivially small pre-compression, but a genuine image
    Pillow can decode, resize, and re-encode without erroring)."""
    from PIL import Image as _Image

    buf = io.BytesIO()
    _Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def _tiny_png() -> bytes:
    return _test_png()


def test_upload_background_image_round_trips_to_public_config(client, admin_headers, fake_bg_storage):
    resp = client.post(
        "/api/v1/admin/background/humanizer",
        headers=admin_headers,
        files={"file": ("bg.png", _tiny_png(), "image/png")},
    )
    assert resp.status_code == 200
    assert resp.json()["image_url"].startswith("/app/background/humanizer")

    # Uploading alone does NOT flip the mode -- the frontend gates the
    # save on this, and the backend independently doesn't assume it either.
    body = client.get("/api/v1/app/config").json()
    assert body["backgrounds"]["humanizer"]["mode"] == "dynamic"
    # Versioned query param, not the bare path -- verifies the real fix for a
    # real bug (a re-upload left the old image showing because the path alone
    # never changed and the response is cached for an hour).
    assert body["backgrounds"]["humanizer"]["image_url"].startswith("/app/background/humanizer?v=")

    img = client.get("/api/v1/app/background/humanizer")
    assert img.status_code == 200
    # Always re-encoded to WebP and compressed under the size budget --
    # real, not just declared: decode it back and check its actual size.
    assert img.headers["content-type"] == "image/webp"
    assert len(img.content) <= 100 * 1024
    from PIL import Image as _Image
    decoded = _Image.open(io.BytesIO(img.content))
    decoded.load()  # forces full decode, not just the header
    assert decoded.format == "WEBP"

    resp = client.put(
        "/api/v1/admin/settings", headers=admin_headers, json={"settings": {"bg_mode_humanizer": "static"}}
    )
    assert resp.status_code == 200
    assert client.get("/api/v1/app/config").json()["backgrounds"]["humanizer"]["mode"] == "static"

    _set("bg_mode_humanizer", "dynamic")


def test_upload_rejects_a_file_that_claims_to_be_an_image_but_isnt(client, admin_headers, fake_bg_storage):
    resp = client.post(
        "/api/v1/admin/background/humanizer",
        headers=admin_headers,
        files={"file": ("bg.png", b"not actually a png", "image/png")},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_FILE_TYPE"


def test_background_upload_rejects_bad_type_size_and_page(client, admin_headers, fake_bg_storage):
    assert client.post(
        "/api/v1/admin/background/humanizer",
        headers=admin_headers,
        files={"file": ("bg.txt", b"not an image", "text/plain")},
    ).status_code == 400

    assert client.post(
        "/api/v1/admin/background/humanizer",
        headers=admin_headers,
        files={"file": ("bg.png", b"\x00" * (8 * 1024 * 1024 + 1), "image/png")},
    ).status_code == 413

    assert client.post(
        "/api/v1/admin/background/not_a_real_page",
        headers=admin_headers,
        files={"file": ("bg.png", _tiny_png(), "image/png")},
    ).status_code == 400


def test_reupload_changes_the_public_config_image_url(client, admin_headers, fake_bg_storage):
    """Real bug, found live: the image URL's PATH never changes between
    uploads, and the serving route sets a 1-hour Cache-Control -- without a
    version query param that changes per upload, a browser that already
    fetched the first image never asks again, and a re-upload appears to
    have no effect. The fix is this query param; this test is what would
    have caught the regression before it shipped."""
    client.post(
        "/api/v1/admin/background/realtime",
        headers=admin_headers,
        files={"file": ("first.png", _tiny_png(), "image/png")},
    )
    first_url = client.get("/api/v1/app/config").json()["backgrounds"]["realtime"]["image_url"]

    client.post(
        "/api/v1/admin/background/realtime",
        headers=admin_headers,
        files={"file": ("second.png", _tiny_png(), "image/png")},
    )
    second_url = client.get("/api/v1/app/config").json()["backgrounds"]["realtime"]["image_url"]

    assert first_url != second_url
    assert first_url.split("?")[0] == second_url.split("?")[0] == "/app/background/realtime"

    # Tests share one in-memory DB for the whole run -- leaving this behind
    # would make a later test see an image that "shouldn't" be there yet.
    client.delete("/api/v1/admin/background/realtime", headers=admin_headers)


def test_reupload_replaces_and_delete_falls_back_to_dynamic(client, admin_headers, fake_bg_storage):
    client.post(
        "/api/v1/admin/background/checker",
        headers=admin_headers,
        files={"file": ("first.png", _test_png(color=(220, 30, 30)), "image/png")},
    )
    old_bytes = client.get("/api/v1/app/background/checker").content

    client.post(
        "/api/v1/admin/background/checker",
        headers=admin_headers,
        files={"file": ("second.png", _test_png(color=(30, 120, 220)), "image/png")},
    )
    new_bytes = client.get("/api/v1/app/background/checker").content
    assert old_bytes != new_bytes  # the old object is gone, not just shadowed

    client.put("/api/v1/admin/settings", headers=admin_headers, json={"settings": {"bg_mode_checker": "static"}})
    assert client.get("/api/v1/app/config").json()["backgrounds"]["checker"]["mode"] == "static"

    del_resp = client.delete("/api/v1/admin/background/checker", headers=admin_headers)
    assert del_resp.status_code == 200
    body = client.get("/api/v1/app/config").json()
    # Deleting the only image a "static" page has falls back to dynamic
    # automatically -- a page can never be stuck in "static" with nothing to show.
    assert body["backgrounds"]["checker"]["mode"] == "dynamic"
    assert body["backgrounds"]["checker"]["image_url"] is None
    assert client.get("/api/v1/app/background/checker").status_code == 404


def test_cannot_save_static_mode_without_an_uploaded_image(client, admin_headers):
    resp = client.put(
        "/api/v1/admin/settings", headers=admin_headers, json={"settings": {"bg_mode_realtime": "static"}}
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "NO_BACKGROUND_IMAGE"
    # Rejected as a whole -- no other setting in the same request silently applied.
    assert runtime_settings.get("bg_mode_realtime") == "dynamic"


def test_background_routes_require_admin(client, auth_headers, fake_bg_storage):
    resp = client.post(
        "/api/v1/admin/background/humanizer",
        headers=auth_headers,
        files={"file": ("bg.png", _tiny_png(), "image/png")},
    )
    assert resp.status_code == 403


# ── Storage usage (2026-09-20) ───────────────────────────────────────────────────

def test_storage_usage_requires_admin(client, auth_headers):
    assert client.get("/api/v1/admin/system/storage", headers=auth_headers).status_code == 403


def test_storage_usage_neon_is_null_on_sqlite_dev(client, admin_headers):
    """Tests run against SQLite (see conftest.py) -- pg_database_size/
    pg_stat_user_tables don't exist there, so this must degrade to null
    rather than error, exactly like production would on a non-Postgres dev
    setup."""
    body = client.get("/api/v1/admin/system/storage", headers=admin_headers).json()
    assert body["neon"] is None


def test_storage_usage_reports_real_r2_totals(client, admin_headers, fake_bg_storage):
    client.post(
        "/api/v1/admin/background/humanizer",
        headers=admin_headers,
        files={"file": ("bg.png", _tiny_png(), "image/png")},
    )
    body = client.get("/api/v1/admin/system/storage", headers=admin_headers).json()
    r2 = body["r2"]
    assert r2 is not None
    assert r2["object_count"] == 1
    assert r2["used_bytes"] > 0
    assert r2["limit_bytes"] == 10 * 1024 * 1024 * 1024
    # fake_bg_storage swaps in LocalStorageService for the test (never hits real
    # R2) -- that backend is genuinely flat on disk (see its own usage_summary),
    # so it reports one "(all)" bucket rather than R2's real "/"-prefix grouping.
    assert r2["by_prefix"] == [{"prefix": "(all)", "bytes": r2["used_bytes"], "count": 1}]


# ── Settings: typed values ─────────────────────────────────────────────────────

def test_settings_describe_bool_and_text_types(client, admin_headers):
    resp = client.get("/api/v1/admin/settings", headers=admin_headers)
    assert resp.status_code == 200
    by_key = {s["key"]: s for s in resp.json()}
    assert by_key["maintenance_mode"]["type"] == "bool"
    assert by_key["announcement_text"]["type"] == "str"
    assert by_key["rag_top_k"]["type"] == "int"
    assert by_key["maintenance_mode"]["category"] == "platform"
    assert by_key["rag_top_k"]["category_label"] == "Research Copilot"


def test_settings_reject_bad_bool_and_overlong_text(client, admin_headers):
    resp = client.put("/api/v1/admin/settings", headers=admin_headers, json={"settings": {"maintenance_mode": "maybe"}})
    assert resp.status_code == 400
    resp = client.put(
        "/api/v1/admin/settings", headers=admin_headers, json={"settings": {"announcement_text": "x" * 301}}
    )
    assert resp.status_code == 400


def test_announcement_round_trips_to_public_config(client, admin_headers):
    resp = client.put(
        "/api/v1/admin/settings", headers=admin_headers, json={"settings": {"announcement_text": "  Scheduled upgrade tonight  "}}
    )
    assert resp.status_code == 200
    try:
        assert client.get("/api/v1/app/config").json()["announcement"] == "Scheduled upgrade tonight"
    finally:
        _set("announcement_text", "")


# ── Tool kill switches ─────────────────────────────────────────────────────────

def test_disabled_tool_returns_503(client, admin_headers, auth_headers):
    ok = client.post("/api/v1/humanize", headers=auth_headers, json={"text": "word " * 60})
    assert ok.status_code == 200

    resp = client.put(
        "/api/v1/admin/settings", headers=admin_headers, json={"settings": {"tool_humanizer_enabled": False}}
    )
    assert resp.status_code == 200
    try:
        blocked = client.post("/api/v1/humanize", headers=auth_headers, json={"text": "word " * 60})
        assert blocked.status_code == 503
        assert blocked.json()["error"]["code"] == "TOOL_DISABLED"
        assert client.get("/api/v1/app/config").json()["tools"]["humanizer"] is False
        # Other tools are untouched.
        assert client.post("/api/v1/checker/text", headers=auth_headers, json={"text": "word " * 60}).status_code == 200
    finally:
        _set("tool_humanizer_enabled", True)


# ── Maintenance mode ───────────────────────────────────────────────────────────

def test_maintenance_mode_blocks_tools_but_not_auth_or_admin(client, admin_headers, auth_headers):
    _set("maintenance_mode", True)
    try:
        blocked = client.get("/api/v1/sessions", headers=auth_headers)
        assert blocked.status_code == 503
        assert blocked.json()["error"]["code"] == "MAINTENANCE"
        assert client.get("/api/v1/auth/me", headers=auth_headers).status_code == 200
        assert client.get("/api/v1/admin/stats", headers=admin_headers).status_code == 200
        assert client.get("/api/v1/app/config").json()["maintenance_mode"] is True
        assert client.get("/health").status_code == 200
    finally:
        _set("maintenance_mode", False)
    assert client.get("/api/v1/sessions", headers=auth_headers).status_code == 200


# ── Sign-ups ───────────────────────────────────────────────────────────────────

def test_closed_signups_reject_new_emails_only(client, unique_email):
    # Existing account first, while sign-ups are open.
    _register_and_login(client, unique_email)
    _set("signups_enabled", False)
    try:
        new_email = "brand-new-" + unique_email
        resp = client.post("/api/v1/auth/send-otp", json={"email": new_email})
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "SIGNUPS_DISABLED"
        assert client.post("/api/v1/auth/send-otp", json={"email": unique_email}).status_code == 200
    finally:
        _set("signups_enabled", True)



# ── Retention ──────────────────────────────────────────────────────────────────

def test_retention_cleanup_runs_on_ordinary_requests_not_just_root_and_health(client, auth_headers, monkeypatch):
    """Regression guard: retention cleanup used to depend entirely on an
    external uptime monitor hitting exactly "/" or "/health" - paths the
    frontend never calls. On a deployment where that pinger was
    misconfigured or simply stopped, cleanup silently never ran, while
    the UI kept showing an "expires in Nd" countdown that implied it was.
    It's now triggered from the request middleware itself, so any real
    traffic - here, a plain, unrelated API call - offers it a chance to run."""
    spy = MagicMock()
    monkeypatch.setattr(request_context_module, "maybe_run_cleanup", spy)

    resp = client.get("/api/v1/sessions", headers=auth_headers)
    assert resp.status_code == 200
    assert spy.call_count >= 1


# ── Usage tracking ─────────────────────────────────────────────────────────────

def test_tool_requests_are_recorded_as_usage_events(client, auth_headers, unique_email, track_usage):
    resp = client.post("/api/v1/chat", headers=auth_headers, json={"messages": [{"role": "user", "content": "hi"}]})
    assert resp.status_code == 200
    resp.read()

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == unique_email).first()
        events = db.query(UsageEvent).filter(UsageEvent.user_id == user.id, UsageEvent.tool == "research_copilot").all()
        assert len(events) == 1
        assert events[0].ok is True
        assert events[0].status_code == 200
        assert events[0].duration_ms >= 0
        # Polling/list endpoints are deliberately not counted.
        client.get("/api/v1/sessions", headers=auth_headers)
        assert db.query(UsageEvent).filter(UsageEvent.user_id == user.id).count() == 1
    finally:
        db.close()


def test_failed_tool_requests_are_recorded_as_errors(client, auth_headers, unique_email, track_usage):
    resp = client.post("/api/v1/humanize", headers=auth_headers, json={})
    assert resp.status_code == 422
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == unique_email).first()
        event = db.query(UsageEvent).filter(UsageEvent.user_id == user.id, UsageEvent.tool == "humanizer").first()
        assert event is not None and event.ok is False and event.status_code == 422
    finally:
        db.close()


# ── Admin read surfaces ────────────────────────────────────────────────────────

def test_stats_include_new_counters(client, admin_headers):
    body = client.get("/api/v1/admin/stats", headers=admin_headers).json()
    for key in ["suspended_users", "new_users_7d", "failed_documents", "total_humanizer_runs",
                "total_realtime_sessions", "requests_24h", "errors_24h", "active_users_24h"]:
        assert key in body


def test_analytics_series_and_tools(client, admin_headers, auth_headers, track_usage):
    client.post("/api/v1/chat", headers=auth_headers, json={"messages": [{"role": "user", "content": "hi"}]}).read()
    resp = client.get("/api/v1/admin/analytics?days=7", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["days"] == 7
    assert len(body["series"]) == 7
    assert set(body["series"][0]) >= {"date", "signups", "documents", "messages", "requests", "errors"}
    assert sum(day["requests"] for day in body["series"]) >= 1
    tools = {t["tool"]: t for t in body["tools"]}
    assert tools["research_copilot"]["requests"] >= 1
    assert tools["research_copilot"]["label"] == "Research Copilot"
    assert body["top_users"] and body["active_users_7d"] >= 1


def test_documents_listing_and_audit_log(client, admin_headers):
    resp = client.get("/api/v1/admin/documents?status=all", headers=admin_headers)
    assert resp.status_code == 200
    assert {"documents", "total", "skip", "limit"} <= set(resp.json())

    client.put("/api/v1/admin/settings", headers=admin_headers, json={"settings": {"rag_top_k": 5}})
    _set("rag_top_k", 6)
    log = client.get("/api/v1/admin/audit-log?action=settings.", headers=admin_headers)
    assert log.status_code == 200
    entries = log.json()["entries"]
    assert entries and entries[0]["action"] == "settings.update"
    assert json.loads(entries[0]["details"])["rag_top_k"] == 5


def test_usage_events_and_system_info(client, admin_headers, auth_headers, track_usage):
    client.post("/api/v1/chat", headers=auth_headers, json={"messages": [{"role": "user", "content": "hi"}]}).read()
    events = client.get("/api/v1/admin/usage-events?tool=research_copilot", headers=admin_headers)
    assert events.status_code == 200
    assert events.json()["total"] >= 1
    assert events.json()["events"][0]["user_email"]

    system = client.get("/api/v1/admin/system", headers=admin_headers)
    assert system.status_code == 200
    body = system.json()
    assert body["database"]["dialect"] == "sqlite"
    assert body["storage"]["backend"] in {"local", "r2"}
    assert body["openai"]["ok"] is None  # no probe requested, no network call made
    assert "api_key" not in json.dumps(body).lower()

    external = {e["name"]: e for e in body["external_apis"]}
    assert external["OpenAI"]["configured"] is True  # OPENAI_API_KEY set by conftest.py
    assert external["Neon (Postgres)"]["tracked_here"] is True
    assert external["Modal (Ultra Human GPU hosting)"]["tracked_here"] is False
    assert external["Modal (Ultra Human GPU hosting)"]["dashboard_url"].startswith("https://")
    # Never expose a real key value, only whether one is set.
    assert "sk-test-placeholder" not in json.dumps(body)


def test_users_filters_export_revoke_and_activity(client, admin_headers, unique_email):
    users = client.get(f"/api/v1/admin/users?q={unique_email}&role=admin&status=active&sort=email", headers=admin_headers)
    assert users.status_code == 200
    assert users.json()["total"] == 1
    me = users.json()["users"][0]

    csv_resp = client.get("/api/v1/admin/users/export", headers=admin_headers)
    assert csv_resp.status_code == 200
    assert csv_resp.headers["content-type"].startswith("text/csv")
    assert unique_email in csv_resp.text

    other = "victim-" + unique_email
    _register_and_login(client, other)
    other_id = client.get(f"/api/v1/admin/users?q={other}", headers=admin_headers).json()["users"][0]["id"]

    revoked = client.post(f"/api/v1/admin/users/{other_id}/revoke-sessions", headers=admin_headers)
    assert revoked.status_code == 200
    assert "Revoked 1" in revoked.json()["message"]

    activity = client.get(f"/api/v1/admin/users/{other_id}/activity", headers=admin_headers)
    assert activity.status_code == 200
    assert activity.json()["active_refresh_tokens"] == 0
    assert activity.json()["identities"] == ["otp"]

    patched = client.patch(f"/api/v1/admin/users/{other_id}", headers=admin_headers, json={"email_verified": False})
    assert patched.status_code == 200
    assert me["email"] == unique_email


def test_suspending_a_user_revokes_their_refresh_tokens(client, admin_headers, unique_email):
    other = "suspend-" + unique_email
    _register_and_login(client, other)
    other_id = client.get(f"/api/v1/admin/users?q={other}", headers=admin_headers).json()["users"][0]["id"]
    assert client.patch(f"/api/v1/admin/users/{other_id}", headers=admin_headers, json={"is_active": False}).status_code == 200
    activity = client.get(f"/api/v1/admin/users/{other_id}/activity", headers=admin_headers).json()
    assert activity["active_refresh_tokens"] == 0


def test_bulk_delete_users_reports_success_and_per_item_failure(client, admin_headers, unique_email):
    victim_a = "bulk-a-" + unique_email
    victim_b = "bulk-b-" + unique_email
    _register_and_login(client, victim_a)
    _register_and_login(client, victim_b)

    users = client.get(f"/api/v1/admin/users?q={unique_email}", headers=admin_headers).json()["users"]
    admin_id = next(u["id"] for u in users if u["email"] == unique_email and u.get("is_admin"))
    id_a = next(u["id"] for u in users if u["email"] == victim_a)
    id_b = next(u["id"] for u in users if u["email"] == victim_b)

    # Mix two real deletions with one that must fail (deleting the calling
    # admin) and a duplicate of an already-processed id - the batch should
    # still succeed for the valid entries rather than aborting entirely.
    resp = client.post(
        "/api/v1/admin/users/bulk-delete",
        headers=admin_headers,
        json={"user_ids": [id_a, id_b, admin_id, id_a]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert sorted(body["deleted"]) == sorted([victim_a, victim_b])
    assert len(body["failed"]) == 1
    assert body["failed"][0]["user_id"] == admin_id
    assert body["failed"][0]["error"]

    remaining = client.get(f"/api/v1/admin/users?q={unique_email}", headers=admin_headers).json()["users"]
    assert not any(u["email"] in (victim_a, victim_b) for u in remaining)
    assert any(u["email"] == unique_email for u in remaining)


def test_bulk_delete_rejects_empty_list(client, admin_headers):
    resp = client.post("/api/v1/admin/users/bulk-delete", headers=admin_headers, json={"user_ids": []})
    assert resp.status_code == 422


def test_delete_account_purges_humanizer_runs_and_usage(client, auth_headers, unique_email):
    # Rows inserted directly (not via a live chat request) — this test's job is
    # to verify delete_account purges every table with a user_id foreign key,
    # not to exercise the usage-tracking background task. Mixing a background
    # task's own DB session with a second, immediately-opened session here
    # previously raced over the test harness's single shared SQLite
    # connection (StaticPool) and was intermittently flaky in CI; inserting
    # directly removes the timing dependency entirely.
    db = TestingSessionLocal()
    try:
        user_id = db.query(User).filter(User.email == unique_email).first().id
        db.add(HumanizerRun(user_id=user_id, input_text="in", output_text="out", style="normal"))
        db.add(UsageEvent(user_id=user_id, tool="research_copilot", status_code=200, ok=True, duration_ms=5))
        db.commit()
        assert db.query(HumanizerRun).filter(HumanizerRun.user_id == user_id).count() == 1
        assert db.query(UsageEvent).filter(UsageEvent.user_id == user_id).count() == 1
    finally:
        db.close()

    assert client.delete("/api/v1/auth/account", headers=auth_headers).status_code == 200
    db = TestingSessionLocal()
    try:
        assert db.query(HumanizerRun).filter(HumanizerRun.user_id == user_id).count() == 0
        assert db.query(UsageEvent).filter(UsageEvent.user_id == user_id).count() == 0
    finally:
        db.close()


def test_delete_account_with_chat_messages_does_not_raise_fk_violation(client, auth_headers, unique_email):
    # Regression test for a real production incident: deleting a
    # ChatSession via a bulk Query.delete() does NOT cascade to its
    # ChatMessage rows (that only happens for db.delete(session_obj), and
    # there's no ondelete="CASCADE" on the FK either), so any account with
    # an actual chat message used to blow up account deletion with an
    # IntegrityError. This bit an admin doing a bulk delete of test
    # accounts — it silently aborted partway through the batch, deleting
    # some accounts but not others, once it hit one with real messages.
    db = TestingSessionLocal()
    try:
        user_id = db.query(User).filter(User.email == unique_email).first().id
        session = ChatSession(user_id=user_id, title="t")
        db.add(session)
        db.flush()
        db.add(ChatMessage(session_id=session.id, role="user", content="hi"))
        db.commit()
        session_id = session.id
    finally:
        db.close()

    resp = client.delete("/api/v1/auth/account", headers=auth_headers)
    assert resp.status_code == 200

    db = TestingSessionLocal()
    try:
        assert db.query(ChatMessage).filter(ChatMessage.session_id == session_id).count() == 0
        assert db.query(ChatSession).filter(ChatSession.id == session_id).count() == 0
    finally:
        db.close()


# ── Research actions ───────────────────────────────────────────────────────────

def _run(agen):
    async def collect():
        return [item async for item in agen]

    return asyncio.run(collect())


class _Retrieval:
    def __init__(self):
        self.full_document_called = False
        self.retrieve_called = False

    def retrieve_context(self, query, source_ids=None, n_results=None, user_email="", source_names=None):
        self.retrieve_called = True
        return {"context": "[SOURCE: A.pdf | PAGE: 1]\nsome text", "sources": source_ids or []}

    def get_max_indexed_pages(self, source_ids, user_email=""):
        return {}

    def get_full_document_context(self, source_ids, user_email="", source_names=None, max_chars=None):
        self.full_document_called = True
        return {"context": "[SOURCE: A.pdf | PAGE: 1]\nfull text", "truncated": False, "chunk_count": 1}

    def get_page_context(self, source_ids, pages, user_email="", source_names=None):
        return {"context": "", "chunk_count": 0, "found_pages": [], "missing_pages": pages}


class _AI:
    def __init__(self):
        self.last_messages = None

    async def stream_chat(self, messages):
        self.last_messages = messages
        yield "answer"

    async def classify(self, messages):
        return 'Here you go: ["Q1?", "Q2?", "Q3?", "Q4?"]'


def test_validate_action_requires_documents():
    service = ChatService(retrieval_service=_Retrieval(), ai_service=_AI())
    service.validate_action(None, None)
    with pytest.raises(Exception) as exc:
        service.validate_action("summarize", [])
    assert getattr(exc.value, "code", "") == "ACTION_NEEDS_DOCUMENTS"
    with pytest.raises(Exception) as exc:
        service.validate_action("nonsense", ["a.pdf"])
    assert getattr(exc.value, "code", "") == "UNKNOWN_ACTION"


def test_research_action_uses_whole_document_and_real_instruction():
    retrieval, ai = _Retrieval(), _AI()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)
    events = _run(
        service.stream_response(
            messages=[{"role": "user", "content": "Summarize"}],
            document_ids=["a.pdf"],
            document_names={"a.pdf": "A.pdf"},
            user_email="u@example.com",
            action="summarize",
        )
    )
    assert retrieval.full_document_called and not retrieval.retrieve_called
    assert ai.last_messages[-1] == ("user", RESEARCH_ACTIONS["summarize"]["instruction"])
    assert "NEAR-COMPLETE DOCUMENT" in ai.last_messages[0][1]
    assert events[0] == {"type": "sources", "sources": ["a.pdf"]}
    assert events[-1] == {"type": "suggestions", "suggestions": ["Q1?", "Q2?", "Q3?"]}


def test_follow_ups_can_be_switched_off():
    _set("chat_follow_up_suggestions", False)
    try:
        service = ChatService(retrieval_service=_Retrieval(), ai_service=_AI())
        events = _run(
            service.stream_response(
                messages=[{"role": "user", "content": "what is this about?"}],
                document_ids=["a.pdf"],
                user_email="u@example.com",
            )
        )
        assert all(e["type"] != "suggestions" for e in events)
    finally:
        _set("chat_follow_up_suggestions", True)


def _seed_document(email: str, stored: str) -> None:
    db = TestingSessionLocal()
    try:
        db.add(
            Document(
                user_email=email, original_filename="seed.pdf", stored_filename=stored,
                content_type="application/pdf", size_bytes=10, checksum_sha256=stored, upload_status="ready",
            )
        )
        db.commit()
    finally:
        db.close()


def test_chat_route_streams_suggestions_frame(client, auth_headers, unique_email):
    stored = "seed-" + unique_email + ".pdf"
    _seed_document(unique_email, stored)
    resp = client.post(
        "/api/v1/chat", headers=auth_headers,
        json={"messages": [{"role": "user", "content": "Summarize"}], "document_ids": [stored], "action": "summarize"},
    )
    assert resp.status_code == 200
    body = resp.text
    assert "event: sources" in body
    assert 'event: suggestions\ndata: ["What else?"]' in body
    assert "event: done" in body


def test_chat_route_rejects_unknown_action(client, auth_headers):
    resp = client.post(
        "/api/v1/chat", headers=auth_headers,
        json={"messages": [{"role": "user", "content": "x"}], "document_ids": ["seed.pdf"], "action": "explode"},
    )
    assert resp.status_code == 422


def test_audit_rows_are_written_for_user_changes(client, admin_headers, unique_email):
    other = "audited-" + unique_email
    _register_and_login(client, other)
    other_id = client.get(f"/api/v1/admin/users?q={other}", headers=admin_headers).json()["users"][0]["id"]
    client.patch(f"/api/v1/admin/users/{other_id}", headers=admin_headers, json={"is_admin": True})
    db = TestingSessionLocal()
    try:
        row = (
            db.query(AdminAuditLog)
            .filter(AdminAuditLog.action == "user.update", AdminAuditLog.target == other)
            .order_by(AdminAuditLog.id.desc())
            .first()
        )
        assert row is not None and row.admin_email == unique_email
        assert json.loads(row.details) == {"is_admin": True}
    finally:
        db.close()
