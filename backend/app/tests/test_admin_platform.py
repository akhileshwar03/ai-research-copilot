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
import json

import pytest

from app.db import session as db_session_module
from app.db.models.admin_audit_log import AdminAuditLog
from app.db.models.document import Document
from app.db.models.humanizer_run import HumanizerRun
from app.db.models.usage_event import UsageEvent
from app.db.models.user import User
from app.services.chat_service import RESEARCH_ACTIONS, ChatService
from app.services.runtime_settings import runtime_settings
from app.tests.conftest import TestingSessionLocal
from app.tests.test_admin_and_security import _make_admin, _register_and_login


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
    # Nothing that only an admin should see leaks out.
    assert "rag_similarity_threshold" not in json.dumps(body)


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


def test_delete_account_purges_humanizer_runs_and_usage(client, auth_headers, unique_email, track_usage):
    client.post("/api/v1/chat", headers=auth_headers, json={"messages": [{"role": "user", "content": "hi"}]}).read()

    db = TestingSessionLocal()
    try:
        user_id = db.query(User).filter(User.email == unique_email).first().id
        db.add(HumanizerRun(user_id=user_id, input_text="in", output_text="out", style="normal"))
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
