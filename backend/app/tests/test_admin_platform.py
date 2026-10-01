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
from app.tests.conftest import TEST_DB_URL, TestingSessionLocal
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
    # 2026-09-28: a real gap this fixes -- no upload flow (Research Copilot documents, AI
    # Checker, Paper Analyzer) could check a file's size before uploading it, because the limit
    # was never exposed here; a user could wait through an entire large-file upload just to be
    # rejected at the end. Same class of info as checker_max_chars, safe for an unauthenticated
    # visitor to know. Compared against the live setting, not a hardcoded default -- another
    # test in this suite (test_admin_runtime_settings_roundtrip) legitimately changes this value
    # and shares the same test database, with no per-test reset.
    assert body["max_upload_size_mb"] == int(runtime_settings.get("max_upload_size_mb"))


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


def test_legal_and_contact_settings_default_empty_and_round_trip(client, admin_headers):
    from app.services.runtime_settings import _DEFAULT_PRIVACY_POLICY, _DEFAULT_TERMS_OF_SERVICE

    body = client.get("/api/v1/app/config").json()
    assert body["support_email"] == ""  # only support_email starts genuinely empty
    assert body["legal_entity_name"] == "Querex"
    # Privacy/Terms ship with real starting text, not blank — see runtime_settings.py.
    assert client.get("/api/v1/app/legal/privacy").json() == {"content": _DEFAULT_PRIVACY_POLICY}
    assert client.get("/api/v1/app/legal/terms").json() == {"content": _DEFAULT_TERMS_OF_SERVICE}

    resp = client.put(
        "/api/v1/admin/settings",
        headers=admin_headers,
        json={"settings": {
            "support_email": "hello@querex.app",
            "legal_entity_name": "Querex Labs, Inc.",
            "privacy_policy_content": "We collect only what we need.",
            "terms_of_service_content": "Use this responsibly.",
        }},
    )
    assert resp.status_code == 200
    try:
        body = client.get("/api/v1/app/config").json()
        assert body["support_email"] == "hello@querex.app"
        assert body["legal_entity_name"] == "Querex Labs, Inc."
        assert client.get("/api/v1/app/legal/privacy").json() == {"content": "We collect only what we need."}
        assert client.get("/api/v1/app/legal/terms").json() == {"content": "Use this responsibly."}
    finally:
        _set("support_email", "")
        _set("legal_entity_name", "Querex")
        _set("privacy_policy_content", _DEFAULT_PRIVACY_POLICY)
        _set("terms_of_service_content", _DEFAULT_TERMS_OF_SERVICE)


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
    from app.api.routes.admin import settings as admin_settings, system as admin_system, users as admin_users
    import app.api.routes.app_config as app_config_module

    settings = get_settings()
    monkeypatch.setattr(settings, "r2_account_id", "test-account")
    monkeypatch.setattr(settings, "r2_access_key_id", "test-key")
    monkeypatch.setattr(settings, "r2_secret_access_key", "test-secret")
    monkeypatch.setattr(settings, "r2_bucket_name", "test-bucket")

    fake_storage = LocalStorageService(base_dir=str(tmp_path))
    for admin_module in (admin_settings, admin_system, admin_users):
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


# ── Brand logo (2026-09-21) ───────────────────────────────────────────────────────

def test_logo_upload_round_trips_to_public_config_and_serves(client, admin_headers, fake_bg_storage):
    assert client.get("/api/v1/app/config").json()["logo_url"] is None
    assert client.get("/api/v1/app/logo").status_code == 404

    resp = client.post(
        "/api/v1/admin/logo", headers=admin_headers, files={"file": ("logo.png", _tiny_png(), "image/png")}
    )
    assert resp.status_code == 200
    assert resp.json()["logo_url"].startswith("/app/logo?v=")

    try:
        body = client.get("/api/v1/app/config").json()
        assert body["logo_url"].startswith("/app/logo?v=")

        img = client.get("/api/v1/app/logo")
        assert img.status_code == 200
        assert img.headers["content-type"] == "image/webp"
        assert len(img.content) <= 60 * 1024
        from PIL import Image as _Image

        decoded = _Image.open(io.BytesIO(img.content))
        decoded.load()
        assert decoded.format == "WEBP"
        # RGBA in, but WebP's encoder legitimately drops a fully-opaque alpha
        # channel to save bytes (this test PNG has no real transparency) --
        # either mode confirms the RGBA conversion didn't error or discard
        # color data, which is what actually matters here.
        assert decoded.mode in ("RGB", "RGBA")
    finally:
        client.delete("/api/v1/admin/logo", headers=admin_headers)


def test_logo_upload_preserves_real_transparency(client, admin_headers, fake_bg_storage):
    """The background compressor deliberately converts to RGB, flattening
    transparency (fine for a full-bleed photo backdrop). A logo is composited
    over whatever's behind it in each placement, so this must keep a genuinely
    transparent region intact, not just not-error on one."""
    from PIL import Image as _Image

    buf = io.BytesIO()
    img = _Image.new("RGBA", (200, 200), (220, 30, 30, 255))
    # Punch an actually-transparent hole in one corner.
    for x in range(50):
        for y in range(50):
            img.putpixel((x, y), (0, 0, 0, 0))
    img.save(buf, format="PNG")

    client.post("/api/v1/admin/logo", headers=admin_headers, files={"file": ("logo.png", buf.getvalue(), "image/png")})
    try:
        resp = client.get("/api/v1/app/logo")
        decoded = _Image.open(io.BytesIO(resp.content)).convert("RGBA")
        # The transparent corner should still read near-zero alpha after the
        # resize/recompress round trip (lossy WebP won't hit exactly 0).
        assert decoded.getpixel((5, 5))[3] < 20
        # An opaque region should stay opaque.
        assert decoded.getpixel((150, 150))[3] > 235
    finally:
        client.delete("/api/v1/admin/logo", headers=admin_headers)


def test_logo_reupload_replaces_and_delete_reverts_to_default(client, admin_headers, fake_bg_storage):
    client.post(
        "/api/v1/admin/logo",
        headers=admin_headers,
        files={"file": ("first.png", _test_png(color=(220, 30, 30)), "image/png")},
    )
    first_url = client.get("/api/v1/app/config").json()["logo_url"]
    old_bytes = client.get("/api/v1/app/logo").content

    client.post(
        "/api/v1/admin/logo",
        headers=admin_headers,
        files={"file": ("second.png", _test_png(color=(30, 120, 220)), "image/png")},
    )
    second_url = client.get("/api/v1/app/config").json()["logo_url"]
    new_bytes = client.get("/api/v1/app/logo").content

    assert first_url != second_url  # version param changed
    assert old_bytes != new_bytes  # the old object is gone, not just shadowed

    del_resp = client.delete("/api/v1/admin/logo", headers=admin_headers)
    assert del_resp.status_code == 200
    assert client.get("/api/v1/app/config").json()["logo_url"] is None
    assert client.get("/api/v1/app/logo").status_code == 404


def test_logo_upload_rejects_bad_type_and_size(client, admin_headers, fake_bg_storage):
    assert client.post(
        "/api/v1/admin/logo", headers=admin_headers, files={"file": ("logo.txt", b"not an image", "text/plain")}
    ).status_code == 400

    assert client.post(
        "/api/v1/admin/logo",
        headers=admin_headers,
        files={"file": ("logo.png", b"\x00" * (4 * 1024 * 1024 + 1), "image/png")},
    ).status_code == 413


def test_logo_delete_without_upload_is_404(client, admin_headers):
    assert client.delete("/api/v1/admin/logo", headers=admin_headers).status_code == 404


def test_logo_routes_require_admin(client, auth_headers, fake_bg_storage):
    resp = client.post(
        "/api/v1/admin/logo", headers=auth_headers, files={"file": ("logo.png", _tiny_png(), "image/png")}
    )
    assert resp.status_code == 403


# ── Storage usage (2026-09-20) ───────────────────────────────────────────────────

def test_storage_usage_requires_admin(client, auth_headers):
    assert client.get("/api/v1/admin/system/storage", headers=auth_headers).status_code == 403


@pytest.mark.skipif(
    not TEST_DB_URL.startswith("sqlite"),
    reason="This asserts the SQLite-only degradation path; the Postgres CI job legitimately gets real neon usage back instead.",
)
def test_storage_usage_neon_is_null_on_sqlite_dev(client, admin_headers):
    """Tests run against SQLite by default (see conftest.py) --
    pg_database_size/pg_stat_user_tables don't exist there, so this must
    degrade to null rather than error, exactly like production would on a
    non-Postgres dev setup. Skipped on the Postgres CI job, which legitimately
    gets real (if empty-database) numbers back instead of null."""
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
    assert body["top_users"] and body["active_users"] >= 1


def _seed_usage(email: str, day: str, *, tool: str = "humanizer", ok: bool = True, count: int = 1) -> int:
    from datetime import datetime

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        for _ in range(count):
            db.add(
                UsageEvent(
                    user_id=user.id,
                    tool=tool,
                    status_code=200 if ok else 500,
                    ok=ok,
                    duration_ms=100,
                    created_at=datetime.fromisoformat(day + "T12:00:00"),
                )
            )
        db.commit()
        return user.id
    finally:
        db.close()


def test_analytics_custom_range_is_inclusive_and_bounded(client, admin_headers, unique_email):
    _seed_usage(unique_email, "2026-03-10", count=2)
    _seed_usage(unique_email, "2026-03-12", count=3)
    _seed_usage(unique_email, "2026-03-13", count=5)  # outside the window

    resp = client.get("/api/v1/admin/analytics?start=2026-03-10&end=2026-03-12", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert (body["start"], body["end"], body["days"]) == ("2026-03-10", "2026-03-12", 3)
    by_day = {d["date"]: d["requests"] for d in body["series"]}
    assert by_day == {"2026-03-10": 2, "2026-03-11": 0, "2026-03-12": 3}
    assert body["tools"][0]["requests"] == 5
    assert "previous" not in body


def test_analytics_compare_returns_equal_length_previous_period(client, admin_headers, unique_email):
    _seed_usage(unique_email, "2025-06-11", count=4)  # previous period
    _seed_usage(unique_email, "2025-06-13", count=1)  # current period

    body = client.get(
        "/api/v1/admin/analytics?start=2025-06-12&end=2025-06-14&compare=true", headers=admin_headers
    ).json()
    previous = body["previous"]
    assert (previous["start"], previous["end"], previous["days"]) == ("2025-06-09", "2025-06-11", 3)
    assert sum(d["requests"] for d in previous["series"]) == 4
    assert sum(d["requests"] for d in body["series"]) == 1
    assert "previous" not in previous


def test_analytics_scopes_to_a_single_user(client, admin_headers, unique_email):
    other_email = "other-" + unique_email
    _register_and_login(client, other_email)
    mine = _seed_usage(unique_email, "2025-01-10", count=2)
    _seed_usage(other_email, "2025-01-10", count=7)

    everyone = client.get("/api/v1/admin/analytics?start=2025-01-10&end=2025-01-10", headers=admin_headers).json()
    scoped = client.get(
        f"/api/v1/admin/analytics?start=2025-01-10&end=2025-01-10&user_id={mine}", headers=admin_headers
    ).json()
    assert everyone["series"][0]["requests"] == 9
    assert scoped["series"][0]["requests"] == 2
    assert scoped["user_id"] == mine
    assert [u["user_id"] for u in scoped["top_users"]] == [mine]


def test_analytics_hourly_buckets_by_weekday_and_hour(client, admin_headers, unique_email):
    from datetime import date, datetime, timezone

    monday, sunday = "2024-11-04", "2024-11-10"
    assert date.fromisoformat(monday).weekday() == 0 and date.fromisoformat(sunday).weekday() == 6
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == unique_email).first()
        for stamp, ok in [
            (f"{monday}T09:05:00", True),
            (f"{monday}T09:55:00", False),
            (f"{sunday}T23:10:00", True),
        ]:
            db.add(
                UsageEvent(
                    user_id=user.id,
                    tool="checker",
                    status_code=200 if ok else 500,
                    ok=ok,
                    duration_ms=50,
                    created_at=datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc),
                )
            )
        db.commit()
        uid = user.id
    finally:
        db.close()

    body = client.get(
        f"/api/v1/admin/analytics?start={monday}&end={sunday}&user_id={uid}", headers=admin_headers
    ).json()
    assert body["hourly"] == [
        {"weekday": 0, "hour": 9, "requests": 2, "errors": 1},
        {"weekday": 6, "hour": 23, "requests": 1, "errors": 0},
    ]
    outside = client.get(
        f"/api/v1/admin/analytics?start=2024-11-11&end=2024-11-12&user_id={uid}", headers=admin_headers
    ).json()
    assert outside["hourly"] == []


def _make_user(client, email: str) -> int:
    _register_and_login(client, email)
    db = TestingSessionLocal()
    try:
        return db.query(User).filter(User.email == email).first().id
    finally:
        db.close()


def test_analytics_active_users_follow_the_selected_range(client, admin_headers, unique_email):
    """Regression: 'active users' used to be a rolling window from *now*, so it ignored the range."""
    other = "active-" + unique_email
    other_id = _make_user(client, other)
    _seed_usage(unique_email, "2023-05-10", count=1)
    _seed_usage(unique_email, "2023-05-11", count=1)
    _seed_usage(other, "2023-05-11", count=2)

    one_day = client.get("/api/v1/admin/analytics?start=2023-05-10&end=2023-05-10", headers=admin_headers).json()
    two_days = client.get("/api/v1/admin/analytics?start=2023-05-10&end=2023-05-11", headers=admin_headers).json()
    scoped = client.get(
        f"/api/v1/admin/analytics?start=2023-05-10&end=2023-05-11&user_id={other_id}", headers=admin_headers
    ).json()

    assert one_day["active_users"] == 1
    assert two_days["active_users"] == 2
    assert [d["active_users"] for d in two_days["series"]] == [1, 2]
    assert scoped["active_users"] == 1


def test_analytics_engagement_uses_average_daily_actives(client, admin_headers, unique_email):
    other = "eng-" + unique_email
    _make_user(client, other)
    _seed_usage(unique_email, "2022-03-01")
    _seed_usage(unique_email, "2022-03-02")
    _seed_usage(other, "2022-03-02")

    body = client.get("/api/v1/admin/analytics?start=2022-03-02&end=2022-03-02", headers=admin_headers).json()
    engagement = body["engagement"]
    assert engagement["window_days"] == 30
    assert engagement["dau"] == 2
    assert engagement["mau"] == 2
    assert engagement["active_days"] == 2
    # 3 user-days over a 30-day window / 2 distinct users = 0.1 avg DAU, 5% stickiness
    assert engagement["avg_dau"] == 0.1
    assert engagement["stickiness_pct"] == 5.0


def test_analytics_tool_and_user_totals_are_exact_beyond_the_latency_sample(
    client, admin_headers, unique_email, monkeypatch
):
    import app.services.admin_analytics as analytics_module

    monkeypatch.setattr(analytics_module, "TOOL_DURATION_SAMPLE", 3)
    _seed_usage(unique_email, "2023-07-04", tool="checker", count=8)
    _seed_usage(unique_email, "2023-07-04", tool="checker", ok=False, count=2)

    body = client.get("/api/v1/admin/analytics?start=2023-07-04&end=2023-07-04", headers=admin_headers).json()
    (tool,) = body["tools"]
    assert (tool["requests"], tool["errors"], tool["error_rate"]) == (10, 2, 0.2)
    assert body["top_users"][0]["requests"] == 10
    assert body["series"][0]["requests"] == 10
    assert body["latency"]["avg_ms"] == 100


def test_analytics_messages_use_their_own_timestamp(client, admin_headers, unique_email):
    from datetime import datetime, timezone

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == unique_email).first()
        session = ChatSession(user_id=user.id, title="long conversation")
        session.created_at = datetime(2023, 8, 1, 10, tzinfo=timezone.utc)
        db.add(session)
        db.flush()
        for day in (1, 3, 3):
            db.add(
                ChatMessage(
                    session_id=session.id,
                    role="user",
                    content="hi",
                    created_at=datetime(2023, 8, day, 12, tzinfo=timezone.utc),
                )
            )
        db.commit()
    finally:
        db.close()

    body = client.get("/api/v1/admin/analytics?start=2023-08-01&end=2023-08-03", headers=admin_headers).json()
    assert [d["messages"] for d in body["series"]] == [1, 0, 2]
    assert [d["sessions"] for d in body["series"]] == [1, 0, 0]


def test_analytics_rejects_bad_ranges_and_unknown_users(client, admin_headers):
    inverted = client.get("/api/v1/admin/analytics?start=2026-03-12&end=2026-03-10", headers=admin_headers)
    assert inverted.status_code == 400 and inverted.json()["error"]["code"] == "INVALID_RANGE"

    huge = client.get("/api/v1/admin/analytics?start=2024-01-01&end=2026-03-10", headers=admin_headers)
    assert huge.status_code == 400 and huge.json()["error"]["code"] == "RANGE_TOO_LARGE"

    missing = client.get("/api/v1/admin/analytics?user_id=999999", headers=admin_headers)
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "USER_NOT_FOUND"

    garbage = client.get("/api/v1/admin/analytics?start=not-a-date", headers=admin_headers)
    assert garbage.status_code == 422


def test_analytics_requires_admin(client, auth_headers):
    assert client.get("/api/v1/admin/analytics?start=2026-03-10&end=2026-03-12", headers=auth_headers).status_code == 403


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
    assert body["database"]["dialect"] in {"sqlite", "postgresql"}
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
    assert csv_resp.content.startswith(b"\xef\xbb\xbf")
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

    async def retrieve_context(self, query, source_ids=None, n_results=None, user_email="", source_names=None):
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


# ── PDF report ─────────────────────────────────────────────────────────────────

def _report_text(pdf_bytes: bytes) -> tuple[str, "pymupdf.Document"]:
    import pymupdf

    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    return "\n".join(page.get_text() for page in doc), doc


def test_report_pdf_is_a_real_multi_page_document(client, admin_headers, unique_email):
    _seed_usage(unique_email, "2021-04-05", tool="checker", count=6)
    _seed_usage(unique_email, "2021-04-05", tool="checker", ok=False, count=2)
    _seed_usage(unique_email, "2021-04-06", tool="humanizer", count=3)

    resp = client.get("/api/v1/admin/report.pdf?start=2021-04-01&end=2021-04-07", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert 'filename="querex-report-2021-04-01_to_2021-04-07.pdf"' in resp.headers["content-disposition"]
    assert resp.content.startswith(b"%PDF")

    text, doc = _report_text(resp.content)
    assert doc.page_count >= 8
    for heading in ["Executive summary", "Traffic and growth", "Product usage", "Reliability", "Users and engagement",
                    "Activity patterns", "Content and storage", "Platform operations", "Appendix A", "Appendix B"]:
        assert heading in text
    assert "11" in text and "AI Checker" in text and "Humanizer" in text  # 11 requests, both tools named
    assert "2021-04-05" in text  # daily appendix rows
    assert sum(len(page.get_drawings()) for page in doc) > 200  # vector charts, not text only
    assert doc.metadata["title"] == "Querex report 2021-04-01 to 2021-04-07"


def test_report_pdf_scopes_to_one_user_and_is_audited(client, admin_headers, unique_email):
    other = "report-" + unique_email
    bystander = "bystander-" + unique_email
    other_id = _make_user(client, other)
    _make_user(client, bystander)
    _seed_usage(other, "2021-05-03", count=4)
    _seed_usage(bystander, "2021-05-03", count=9)

    resp = client.get(
        f"/api/v1/admin/report.pdf?start=2021-05-01&end=2021-05-07&user_id={other_id}", headers=admin_headers
    )
    assert resp.status_code == 200
    text, _ = _report_text(resp.content)
    assert other in text
    assert "Administrator activity is only reported for the whole platform" in text
    assert bystander not in text

    log = client.get("/api/v1/admin/audit-log?action=report.export", headers=admin_headers).json()["entries"]
    assert any(entry["target"] == other for entry in log)


def test_report_pdf_builds_for_a_period_with_no_activity(client, admin_headers):
    resp = client.get("/api/v1/admin/report.pdf?start=2001-01-01&end=2001-01-03", headers=admin_headers)
    assert resp.status_code == 200
    text, doc = _report_text(resp.content)
    assert "No tool requests were recorded" in text
    assert doc.page_count >= 6


def test_report_pdf_validates_range_and_unknown_user(client, admin_headers):
    assert client.get("/api/v1/admin/report.pdf?start=2021-05-09&end=2021-05-01", headers=admin_headers).status_code == 400
    assert client.get("/api/v1/admin/report.pdf?user_id=999999", headers=admin_headers).status_code == 404


def test_report_pdf_requires_admin(client, auth_headers):
    assert client.get("/api/v1/admin/report.pdf?start=2021-05-01&end=2021-05-07", headers=auth_headers).status_code == 403


def test_document_summary_counts_the_whole_inventory_by_status_and_size(client, admin_headers, unique_email):
    from app.services.admin_analytics import document_summary

    owner = "docs-" + unique_email
    db = TestingSessionLocal()
    try:
        for i, (size, status) in enumerate(
            [(200, "ready"), (900_000, "ready"), (2 * 1024 * 1024, "failed"), (10 * 1024 * 1024, "ready"), (12 * 1024 * 1024, "empty")]
        ):
            db.add(
                Document(
                    user_email=owner,
                    original_filename=f"f{i}.pdf",
                    stored_filename=f"{owner}-{i}",
                    content_type="application/pdf",
                    size_bytes=size,
                    checksum_sha256=f"sum-{owner}-{i}",
                    upload_status=status,
                )
            )
        db.commit()
        summary = document_summary(db, owner)
    finally:
        db.close()

    assert summary["count"] == 5
    assert summary["bytes"] == 200 + 900_000 + 2 * 1024 * 1024 + 10 * 1024 * 1024 + 12 * 1024 * 1024
    assert summary["by_status"] == {"ready": 3, "failed": 1, "empty": 1}
    assert summary["by_size"] == {"small": 2, "medium": 2, "large": 1}  # 10 MB exactly counts as medium

    def listed(size: str) -> int:
        return client.get(
            f"/api/v1/admin/documents?q={owner}&size={size}&status=all", headers=admin_headers
        ).json()["total"]

    assert [listed(s) for s in ("all", "small", "medium", "large")] == [5, 2, 2, 1]

    everything = client.get("/api/v1/admin/documents/summary", headers=admin_headers).json()
    assert everything["count"] >= 5 and set(everything["by_size"]) == {"small", "medium", "large"}


def test_admin_sign_in_is_audited_but_regular_sign_in_is_not(client, unique_email):
    _register_and_login(client, unique_email)  # regular user at this point
    _make_admin(unique_email)
    _register_and_login(client, unique_email)  # now signs in as an admin

    with TestingSessionLocal() as db:
        rows = db.query(AdminAuditLog).filter(AdminAuditLog.admin_email == unique_email).all()
    assert [r.action for r in rows] == ["admin.login"]


# ── Operational alerts ─────────────────────────────────────────────────────────

def _seed_recent_events(user_id_email: str, tool: str, ok_count: int, fail_count: int):
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with TestingSessionLocal() as db:
        user = db.query(User).filter(User.email == user_id_email).first()
        for i in range(ok_count + fail_count):
            failed = i < fail_count
            db.add(
                UsageEvent(
                    user_id=user.id,
                    tool=tool,
                    status_code=500 if failed else 200,
                    ok=not failed,
                    duration_ms=100,
                    request_id="alert-test",
                    created_at=now - timedelta(minutes=5),
                )
            )
        db.commit()


def test_alerts_flag_error_spike_and_failing_tool(client, admin_headers, unique_email):
    with TestingSessionLocal() as db:
        db.query(UsageEvent).delete()
        db.commit()
    quiet = client.get("/api/v1/admin/alerts", headers=admin_headers)
    assert quiet.status_code == 200 and quiet.json()["alerts"] == []

    _seed_recent_events(unique_email, "humanizer", ok_count=2, fail_count=8)
    alerts = client.get("/api/v1/admin/alerts", headers=admin_headers).json()["alerts"]
    ids = {a["id"] for a in alerts}
    assert "error-rate" in ids and "tool-failing:humanizer" in ids
    assert "80%" in next(a for a in alerts if a["id"] == "error-rate")["title"]


def test_alerts_stay_quiet_on_low_volume(client, admin_headers, unique_email):
    with TestingSessionLocal() as db:
        db.query(UsageEvent).delete()
        db.commit()
    _seed_recent_events(unique_email, "humanizer", ok_count=0, fail_count=3)  # 100% errors but only 3 requests
    assert client.get("/api/v1/admin/alerts", headers=admin_headers).json()["alerts"] == []


def test_alerts_require_authentication(client):
    assert client.get("/api/v1/admin/alerts").status_code in (401, 403)


# 2026-09-28: real incident -- 4 stale-auth 401s from one 7-second browser-testing burst pushed
# Research Copilot's 30-day error rate to 10.8% on the admin overview, comfortably over the 5%
# alert threshold, with zero actual service failures behind it. A 401 (expired/missing token) is
# a client-side auth state, not a defect in the tool it was aimed at -- see
# UsageEvent.is_real_error's docstring. These pin that it's excluded everywhere an error RATE or
# alert is computed, while still being honestly visible in the raw audit log.

def _seed_401s(tool: str, count: int):
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with TestingSessionLocal() as db:
        for _ in range(count):
            db.add(
                UsageEvent(
                    user_id=None,  # a 401 never resolves an authenticated user
                    tool=tool,
                    status_code=401,
                    ok=False,
                    duration_ms=5,
                    request_id="401-test",
                    created_at=now - timedelta(minutes=5),
                )
            )
        db.commit()


def test_401_only_traffic_never_triggers_the_error_rate_alert(client, admin_headers):
    with TestingSessionLocal() as db:
        db.query(UsageEvent).delete()
        db.commit()
    # Above the default alert_min_requests (10) and, pre-fix, a 100% "error" rate -- deliberately
    # sized so this test actually discriminates the fix instead of passing either way because the
    # low-volume gate alone would have suppressed a smaller batch regardless.
    _seed_401s("research_copilot", 15)
    alerts = client.get("/api/v1/admin/alerts", headers=admin_headers).json()["alerts"]
    assert alerts == []


def test_a_real_error_spike_still_alerts_even_with_401_noise_mixed_in(client, admin_headers, unique_email):
    """401s must not accidentally suppress a genuine alert either -- only excluded from the
    numerator, never silently swallowing the whole signal."""
    with TestingSessionLocal() as db:
        db.query(UsageEvent).delete()
        db.commit()
    _seed_401s("humanizer", 5)
    _seed_recent_events(unique_email, "humanizer", ok_count=2, fail_count=8)  # genuine 500s
    alerts = client.get("/api/v1/admin/alerts", headers=admin_headers).json()["alerts"]
    ids = {a["id"] for a in alerts}
    assert "error-rate" in ids and "tool-failing:humanizer" in ids


def test_overview_errors_24h_excludes_401s(client, admin_headers):
    with TestingSessionLocal() as db:
        db.query(UsageEvent).delete()
        db.commit()
    _seed_401s("research_copilot", 4)
    body = client.get("/api/v1/admin/stats", headers=admin_headers).json()
    assert body["errors_24h"] == 0


# 2026-09-30: real bug found via a Dependabot PR's CI run, not flakiness — this test seeded
# its 33 "ok" events against a HARDCODED date literal ("2026-09-28", the day it was written)
# while querying the analytics endpoint for `date.today()`. That only ever worked on the one
# day those two happened to match; it was guaranteed to start failing permanently the very
# next day (and did — surfaced on 2026-10-01 UTC CI, assert 4 == 37, since only the 4 401s,
# seeded against "now" by _seed_401s, still fell inside the query's date range).
#
# First fix attempt used `date.today()` (LOCAL server time) and still failed locally — the
# real admin analytics endpoint resolves "today" in UTC (`_utcnow_naive().date()`, see
# app/api/routes/admin/overview.py), and _seed_401s already stamps its events against UTC
# `datetime.now(timezone.utc)`. Querying with local "today" while the server runs on UTC is
# the same class of bug as the original — just in local/UTC terms instead of frozen/live —
# so this must use UTC "today" everywhere, matching the real endpoint's own contract.
def test_analytics_tool_error_rate_excludes_401s(client, admin_headers, unique_email):
    with TestingSessionLocal() as db:
        db.query(UsageEvent).delete()
        db.commit()
    from datetime import datetime, timezone

    today = datetime.now(timezone.utc).date().isoformat()
    _seed_usage(unique_email, today, tool="research_copilot", ok=True, count=33)
    _seed_401s("research_copilot", 4)
    resp = client.get(f"/api/v1/admin/analytics?start={today}&end={today}", headers=admin_headers)
    tools = {t["tool"]: t for t in resp.json()["tools"]}
    assert tools["research_copilot"]["errors"] == 0
    assert tools["research_copilot"]["error_rate"] == 0.0
    assert tools["research_copilot"]["requests"] == 37  # 401s still count as real traffic


def test_401s_still_show_up_in_the_raw_audit_log(client, admin_headers):
    with TestingSessionLocal() as db:
        db.query(UsageEvent).delete()
        db.commit()
    _seed_401s("research_copilot", 4)
    resp = client.get("/api/v1/admin/usage-events?errors_only=true", headers=admin_headers).json()
    assert resp["total"] == 4
    assert all(e["status_code"] == 401 for e in resp["events"])


# ── Admin two-factor (TOTP) ────────────────────────────────────────────────────

def _current_code(secret: str) -> str:
    import time

    from app.services import admin_2fa

    return admin_2fa._code_at(secret, int(time.time() // 30))


def test_totp_matches_rfc_6238_vector():
    from app.services import admin_2fa

    # RFC 6238 appendix B (SHA-1, secret "12345678901234567890"): T=59s -> 94287082, last 6 digits.
    secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    assert admin_2fa.verify_code(secret, "287082", now=59)
    assert not admin_2fa.verify_code(secret, "287083", now=59)
    assert not admin_2fa.verify_code(secret, "abc", now=59)
    assert admin_2fa.verify_code(secret, "287082", now=59 + 30)  # one step of drift is tolerated
    assert not admin_2fa.verify_code(secret, "287082", now=59 + 90)


def test_admin_two_factor_full_flow(client, admin_headers, unique_email):
    from app.services import admin_2fa

    admin_2fa.clear_failures(unique_email)
    status = client.get("/api/v1/admin/2fa/status", headers=admin_headers).json()
    assert status == {"enabled": False, "verified": True}

    setup = client.post("/api/v1/admin/2fa/setup", headers=admin_headers).json()
    assert setup["otpauth_uri"].startswith("otpauth://totp/")
    with TestingSessionLocal() as db:
        stored = db.query(User).filter(User.email == unique_email).first().totp_secret
    assert stored and setup["secret"] not in stored  # encrypted at rest

    bad = client.post("/api/v1/admin/2fa/enable", json={"code": "000000"}, headers=admin_headers)
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "ADMIN_2FA_INVALID"

    good = client.post("/api/v1/admin/2fa/enable", json={"code": _current_code(setup["secret"])}, headers=admin_headers)
    assert good.status_code == 200
    token = good.json()["token"]

    # Now every admin endpoint needs the step-up token.
    blocked = client.get("/api/v1/admin/stats", headers=admin_headers)
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "ADMIN_2FA_REQUIRED"
    assert client.get("/api/v1/admin/2fa/status", headers=admin_headers).json() == {"enabled": True, "verified": False}
    assert client.get("/api/v1/admin/stats", headers={**admin_headers, "X-Admin-2FA": token}).status_code == 200
    forged = client.get("/api/v1/admin/stats", headers={**admin_headers, "X-Admin-2FA": "not-a-token"})
    assert forged.status_code == 403

    # A normal access token is not a valid step-up token.
    access = admin_headers["Authorization"].split(" ", 1)[1]
    assert client.get("/api/v1/admin/stats", headers={**admin_headers, "X-Admin-2FA": access}).status_code == 403

    # Signing in again requires a fresh code.
    verified = client.post("/api/v1/admin/2fa/verify", json={"code": _current_code(setup["secret"])}, headers=admin_headers)
    assert verified.status_code == 200

    # Disabling needs a valid code too.
    off = client.post("/api/v1/admin/2fa/disable", json={"code": _current_code(setup["secret"])}, headers=admin_headers)
    assert off.status_code == 200
    assert client.get("/api/v1/admin/stats", headers=admin_headers).status_code == 200

    with TestingSessionLocal() as db:
        actions = {r.action for r in db.query(AdminAuditLog).filter(AdminAuditLog.admin_email == unique_email)}
    assert {"admin.2fa_enabled", "admin.2fa_disabled", "admin.2fa_failed"} <= actions


def test_admin_two_factor_locks_out_after_repeated_failures(client, admin_headers, unique_email):
    from app.services import admin_2fa

    admin_2fa.clear_failures(unique_email)
    client.post("/api/v1/admin/2fa/setup", headers=admin_headers)
    for _ in range(admin_2fa.MAX_FAILURES):
        assert client.post("/api/v1/admin/2fa/enable", json={"code": "000000"}, headers=admin_headers).status_code == 400
    locked = client.post("/api/v1/admin/2fa/enable", json={"code": "000000"}, headers=admin_headers)
    assert locked.status_code == 429
    admin_2fa.clear_failures(unique_email)


def test_chat_session_gets_a_timestamp_without_a_database_default():
    """Production's chat_sessions.created_at has no DB default (added by migration 0006), so the model
    itself must supply the value or new sessions are NULL and never counted by analytics."""
    from sqlalchemy import Column, DateTime, Integer, MetaData, Table
    from sqlalchemy.orm import Session as OrmSession

    assert ChatSession.__table__.c.created_at.default is not None
    engine = TestingSessionLocal().get_bind()
    meta = MetaData()
    # Same table minus the server default, like production.
    bare = Table("chat_sessions_bare", meta, Column("id", Integer, primary_key=True), Column("created_at", DateTime(timezone=True)))
    meta.create_all(engine)
    try:
        with OrmSession(engine) as db:
            value = ChatSession.__table__.c.created_at.default.arg(None)
            db.execute(bare.insert().values(id=1, created_at=value))
            db.commit()
            assert db.execute(bare.select()).first().created_at is not None
    finally:
        meta.drop_all(engine)


# ── AI token usage logging ─────────────────────────────────────────────────────

def _ai_usage_rows(email=None):
    from app.db.models.ai_usage_event import AIUsageEvent

    with TestingSessionLocal() as db:
        query = db.query(AIUsageEvent)
        if email:
            user = db.query(User).filter(User.email == email).first()
            query = query.filter(AIUsageEvent.user_id == user.id)
        return query.order_by(AIUsageEvent.id).all()


def test_langchain_callback_records_provider_usage(track_usage):
    from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
    from langchain_core.messages import AIMessage

    from app.services.ai_usage import TokenUsageCallback, reset_usage_context, set_usage_context

    reply = AIMessage(
        content="ok",
        usage_metadata={"input_tokens": 120, "output_tokens": 35, "total_tokens": 155, "input_token_details": {"cache_read": 20}},
        response_metadata={"model_name": "gpt-test-1"},
    )
    llm = GenericFakeChatModel(messages=iter([reply]), callbacks=[TokenUsageCallback("fallback-model")])

    async def run():
        token = set_usage_context({"user_id": None, "request_id": "req-cb"}, "checker")
        try:
            await llm.ainvoke("hello")
        finally:
            reset_usage_context(token)

    before = len(_ai_usage_rows())
    asyncio.run(run())
    row = _ai_usage_rows()[before]
    assert (row.kind, row.model, row.input_tokens, row.output_tokens, row.cached_input_tokens) == ("chat", "gpt-test-1", 120, 35, 20)
    assert (row.tool, row.request_id) == ("checker", "req-cb")


def test_embedding_wrapper_records_exact_tokens(track_usage):
    from app.services.ai_usage import _MeteredEmbeddingsClient

    class Inner:
        def create(self, **kwargs):
            return {"data": [], "usage": {"prompt_tokens": 42, "total_tokens": 42}}

        other = "passthrough"

    client = _MeteredEmbeddingsClient(Inner(), "text-embedding-test")
    before = len(_ai_usage_rows())
    assert client.create(input=["a"], model="text-embedding-test")["usage"]["total_tokens"] == 42
    assert client.other == "passthrough"
    row = _ai_usage_rows()[before]
    assert (row.kind, row.model, row.input_tokens, row.output_tokens) == ("embedding", "text-embedding-test", 42, 0)


def test_ai_usage_is_attributed_to_the_requesting_user_and_tool(client, auth_headers, unique_email, track_usage, monkeypatch):
    """The middleware's context must reach model calls made while a streamed response is generated."""
    from app.api.dependencies import services as service_deps
    from app.services.ai_usage import record_ai_usage
    from app.tests.conftest import FakeChatService
    from app.main import app

    class MeteredChat(FakeChatService):
        async def stream_response(self, *args, **kwargs):
            record_ai_usage(model="gpt-e2e", kind="chat", input_tokens=10, output_tokens=5)
            async for event in super().stream_response(*args, **kwargs):
                yield event

    previous = app.dependency_overrides[service_deps.get_chat_service]
    app.dependency_overrides[service_deps.get_chat_service] = lambda: MeteredChat()
    try:
        client.post("/api/v1/chat", headers=auth_headers, json={"messages": [{"role": "user", "content": "hi"}]}).read()
    finally:
        app.dependency_overrides[service_deps.get_chat_service] = previous

    rows = _ai_usage_rows(unique_email)
    assert len(rows) == 1
    assert (rows[0].tool, rows[0].model, rows[0].input_tokens, rows[0].output_tokens) == ("research_copilot", "gpt-e2e", 10, 5)
    assert rows[0].request_id  # the request's id ties it to the usage event


def test_zero_token_calls_are_not_recorded(track_usage):
    from app.services.ai_usage import record_ai_usage

    before = len(_ai_usage_rows())
    record_ai_usage(model="m", kind="chat", input_tokens=0, output_tokens=0)
    assert len(_ai_usage_rows()) == before


def test_streaming_chat_openai_reports_usage_through_the_real_client_stack(track_usage):
    """Drives the real langchain-openai streaming code against a fake OpenAI endpoint. Without
    stream_usage=True the provider sends no usage chunk and nothing would ever be recorded."""
    import httpx
    from langchain_openai import ChatOpenAI

    from app.services.ai_usage import TokenUsageCallback, reset_usage_context, set_usage_context

    seen_bodies = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen_bodies.append(body)
        chunks = [
            {"id": "c1", "object": "chat.completion.chunk", "model": "gpt-wire-1", "choices": [{"index": 0, "delta": {"role": "assistant", "content": "Hi"}, "finish_reason": None}]},
            {"id": "c1", "object": "chat.completion.chunk", "model": "gpt-wire-1", "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]},
        ]
        if (body.get("stream_options") or {}).get("include_usage"):
            chunks.append({"id": "c1", "object": "chat.completion.chunk", "model": "gpt-wire-1", "choices": [], "usage": {"prompt_tokens": 77, "completion_tokens": 9, "total_tokens": 86}})
        sse = "".join(f"data: {json.dumps(c)}\n\n" for c in chunks) + "data: [DONE]\n\n"
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=sse.encode())

    llm = ChatOpenAI(
        api_key="sk-test",
        base_url="https://api.openai.com/v1",
        model="gpt-wire-1",
        streaming=True,
        stream_usage=True,
        callbacks=[TokenUsageCallback("gpt-wire-1")],
        http_async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )

    async def run():
        token = set_usage_context({"user_id": None, "request_id": "wire"}, "research_copilot")
        try:
            async for _ in llm.astream("hi"):
                pass
        finally:
            reset_usage_context(token)

    before = len(_ai_usage_rows())
    asyncio.run(run())
    assert seen_bodies[0]["stream_options"]["include_usage"] is True
    row = _ai_usage_rows()[before]
    assert (row.model, row.input_tokens, row.output_tokens, row.tool) == ("gpt-wire-1", 77, 9, "research_copilot")


def test_ai_service_clients_all_request_usage_and_carry_the_callback(monkeypatch):
    from app.services.ai_service import AIService
    from app.services.ai_usage import TokenUsageCallback

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    from app.core.config import get_settings

    get_settings.cache_clear()
    try:
        service = AIService()
    finally:
        get_settings.cache_clear()
    for name in ("llm", "classifier_llm", "humanizer_rewrite_llm", "humanizer_classify_llm"):
        model = getattr(service, name)
        assert model.stream_usage is True, name
        assert any(isinstance(cb, TokenUsageCallback) for cb in model.callbacks), name


def test_pricing_math_and_model_matching():
    from app.services.ai_pricing import cost_usd, price_for

    # 800k normal input @ $0.40 + 200k cached @ $0.10 + 500k output @ $1.60 per 1M = 0.32 + 0.02 + 0.80
    assert cost_usd("gpt-4.1-mini", 1_000_000, 500_000, 200_000) == pytest.approx(1.14)
    assert cost_usd("text-embedding-ada-002", 2_000_000, 0) == pytest.approx(0.20)
    # Dated snapshots resolve to their base model, and never to a shorter prefix that is a different model.
    assert price_for("gpt-4.1-mini-2025-04-14") is price_for("gpt-4.1-mini")
    assert price_for("gpt-4.1-nano-2025-04-14").input == 0.10
    assert price_for("gpt-4.1-2025-04-14").input == 2.00
    # Unknown models are unpriced, not free.
    assert price_for("some-future-model") is None
    assert cost_usd("some-future-model", 1000, 1000) is None
    # Cached tokens can never exceed input tokens.
    assert cost_usd("gpt-4.1-mini", 100, 0, 999) == pytest.approx(100 * 0.10 / 1_000_000)


def test_admin_ai_cost_breakdown(client, admin_headers, unique_email, track_usage):
    from datetime import datetime, timedelta, timezone

    from app.db.models.ai_usage_event import AIUsageEvent

    now = datetime.now(timezone.utc)
    with TestingSessionLocal() as db:
        user = db.query(User).filter(User.email == unique_email).first()
        db.query(AIUsageEvent).delete()
        db.add_all(
            [
                AIUsageEvent(user_id=user.id, tool="checker", kind="chat", model="gpt-4.1-mini-2025-04-14", input_tokens=1_000_000, output_tokens=500_000, cached_input_tokens=200_000, created_at=now),
                AIUsageEvent(user_id=user.id, tool="upload", kind="embedding", model="text-embedding-ada-002", input_tokens=2_000_000, created_at=now - timedelta(days=1)),
                AIUsageEvent(user_id=user.id, tool="checker", kind="chat", model="mystery-model", input_tokens=500, output_tokens=500, created_at=now),
                AIUsageEvent(user_id=user.id, tool="checker", kind="chat", model="gpt-4.1-mini", input_tokens=1_000_000, created_at=now - timedelta(days=40)),  # outside the window
            ]
        )
        db.commit()

    body = client.get("/api/v1/admin/ai-usage?days=7", headers=admin_headers).json()
    assert body["total"]["cost_usd"] == pytest.approx(1.14 + 0.20)  # the unpriced model adds nothing
    assert body["total"]["unpriced_calls"] == 1 and body["unpriced_models"] == ["mystery-model"]
    tools = {t["tool"]: t for t in body["by_tool"]}
    assert tools["checker"]["cost_usd"] == pytest.approx(1.14) and tools["upload"]["cost_usd"] == pytest.approx(0.20)
    assert tools["upload"]["label"] == "Document upload"
    assert body["top_users"][0]["email"] == unique_email and body["top_users"][0]["cost_usd"] == pytest.approx(1.34)
    assert [round(d["cost_usd"], 2) for d in body["daily"]] == [0.20, 1.14]
    assert body["pricing"]["verified_on"] and body["pricing"]["source"].startswith("https://")

    # A single-user filter and an explicit date range both narrow the result.
    scoped = client.get(f"/api/v1/admin/ai-usage?days=7&user_id={body['top_users'][0]['user_id']}", headers=admin_headers).json()
    assert scoped["total"]["cost_usd"] == pytest.approx(1.34)
    wide = client.get("/api/v1/admin/ai-usage?days=90", headers=admin_headers).json()
    assert wide["total"]["cost_usd"] == pytest.approx(1.34 + 0.40)  # now includes the 40-day-old call
    assert client.get("/api/v1/admin/ai-usage", headers={}).status_code in (401, 403)
    assert client.get("/api/v1/admin/ai-usage?user_id=999999", headers=admin_headers).status_code == 404


# ── Tavily search cost ─────────────────────────────────────────────────────────

def _tavily_service(monkeypatch, handler, api_key="tvly-test"):
    import httpx

    from app.core.config import get_settings
    from app.services import web_search_service as module

    real_client = httpx.AsyncClient
    monkeypatch.setattr(module.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(get_settings(), "tavily_api_key", api_key)
    return module.WebSearchService()


def test_successful_search_is_recorded_as_one_billed_search(track_usage, monkeypatch):
    import httpx

    from app.services.ai_usage import reset_usage_context, set_usage_context

    service = _tavily_service(monkeypatch, lambda req: httpx.Response(200, json={"results": [{"title": "t", "url": "https://x.example", "content": "c"}]}))

    async def run():
        token = set_usage_context({"user_id": None, "request_id": "r-search"}, "realtime")
        try:
            return await service.search("what is new")
        finally:
            reset_usage_context(token)

    before = len(_ai_usage_rows())
    assert len(asyncio.run(run())) == 1
    row = _ai_usage_rows()[before]
    assert (row.kind, row.model, row.tool, row.request_id, row.input_tokens) == ("search", "tavily-search-basic", "realtime", "r-search", 0)


def test_failed_or_disabled_search_is_not_recorded(track_usage, monkeypatch):
    import httpx

    failing = _tavily_service(monkeypatch, lambda req: httpx.Response(500, json={"error": "boom"}))
    before = len(_ai_usage_rows())
    assert asyncio.run(failing.search("q")) == []
    keyless = _tavily_service(monkeypatch, lambda req: httpx.Response(200, json={"results": []}), api_key="")
    assert asyncio.run(keyless.search("q")) == []
    assert len(_ai_usage_rows()) == before


def test_search_credits_and_cost_are_added_to_the_tool_total(client, admin_headers, unique_email, track_usage):
    from datetime import datetime, timezone

    from app.db.models.ai_usage_event import AIUsageEvent
    from app.services.ai_pricing import search_cost_usd

    assert search_cost_usd("tavily-search-basic", 10) == pytest.approx(0.08)  # 10 credits x $0.008
    assert search_cost_usd("tavily-search-advanced", 10) == pytest.approx(0.16)  # advanced = 2 credits each
    assert search_cost_usd("tavily-unknown", 10) is None

    now = datetime.now(timezone.utc)
    with TestingSessionLocal() as db:
        user = db.query(User).filter(User.email == unique_email).first()
        db.query(AIUsageEvent).delete()
        db.add_all(
            [AIUsageEvent(user_id=user.id, tool="realtime", kind="search", model="tavily-search-basic", created_at=now) for _ in range(5)]
            + [AIUsageEvent(user_id=user.id, tool="realtime", kind="chat", model="gpt-4.1-mini", input_tokens=1_000_000, created_at=now)]
        )
        db.commit()

    body = client.get("/api/v1/admin/ai-usage?days=7", headers=admin_headers).json()
    realtime = next(t for t in body["by_tool"] if t["tool"] == "realtime")
    assert realtime["cost_usd"] == pytest.approx(0.40 + 5 * 0.008)
    assert realtime["search_credits"] == 5 and body["total"]["search_credits"] == 5
    search_row = next(m for m in body["by_model"] if m["kind"] == "search")
    assert (search_row["model"], search_row["calls"], search_row["search_credits"]) == ("tavily-search-basic", 5, 5)
    assert body["search_pricing"]["usd_per_credit"] == 0.008 and body["search_pricing"]["free_credits_per_month"] == 1000
    assert body["unpriced_models"] == []
