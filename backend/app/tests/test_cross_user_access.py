"""A signed-in user must never be able to read, change, or delete ANOTHER user's data.

Added 2026-10-14 during a security review. Chat sessions already had an ownership test
(test_sessions_contract.test_session_ownership_enforced); realtime sessions, humanizer
history, and documents (status / pin / file) had none, and those are exactly the routes that
take an ID from the URL — the shape where an "insecure direct object reference" bug lives.
Each case below creates a resource as user A, then tries to touch it as user B.
"""

import uuid

from fastapi import Depends

from app.api.dependencies import services as service_deps
from app.db.models.document import Document
from app.db.repositories.document_repository import DocumentRepository
from app.db.repositories.humanizer_run_repository import HumanizerRunRepository
from app.db.repositories.user_repository import UserRepository
from app.db.session import get_db
from app.main import app
from app.services.document_service import DocumentService
from app.services.humanizer_service import HumanizerService
from app.tests.conftest import TestingSessionLocal


def _use_real_humanizer_and_document_services():
    """conftest.py replaces BOTH of these services with in-memory fakes that don't enforce
    ownership, so a cross-user test through the default client would only ever test the fake
    (that is exactly how this file's first draft "found" a bug that didn't exist). The real
    ownership checks only touch the database, so build the real services with the AI /
    vector-store dependencies they never use here set to None. conftest clears all overrides
    on teardown."""

    def real_humanizer(db=Depends(get_db)):
        return HumanizerService(ai_service=None, run_repo=HumanizerRunRepository(db), user_repo=UserRepository(db))

    def real_documents(db=Depends(get_db)):
        return DocumentService(document_repo=DocumentRepository(db), ingestion_service=None, vector_store=None)

    app.dependency_overrides[service_deps.get_humanizer_service] = real_humanizer
    app.dependency_overrides[service_deps.get_document_service] = real_documents


def _login(client, email: str) -> dict:
    sent = client.post("/api/v1/auth/send-otp", json={"email": email})
    resp = client.post("/api/v1/auth/verify-otp", json={"email": email, "code": sent.json()["_dev_code"]})
    body = resp.json()
    return {"Authorization": f"bearer {body.get('access_token') or body.get('token')}"}


def _two_users(client, unique_email):
    return _login(client, unique_email), _login(client, f"intruder-{unique_email}")


def test_realtime_session_cannot_be_changed_or_deleted_by_another_user(client, unique_email):
    owner, intruder = _two_users(client, unique_email)
    created = client.post(
        "/api/v1/realtime/sessions",
        json={"session": {"id": 0, "title": "Private", "pinned": False, "messages": []}},
        headers=owner,
    )
    sid = created.json()["id"]

    update = client.put(
        f"/api/v1/realtime/sessions/{sid}",
        json={"session": {"id": sid, "title": "Hijacked", "pinned": False, "messages": []}},
        headers=intruder,
    )
    assert update.status_code in (403, 404)
    assert client.delete(f"/api/v1/realtime/sessions/{sid}", headers=intruder).status_code in (403, 404)

    # ...and the owner's session is untouched.
    sessions = client.get("/api/v1/realtime/sessions", headers=owner).json()["sessions"]
    assert [s["title"] for s in sessions if s["id"] == sid] == ["Private"]
    assert client.get("/api/v1/realtime/sessions", headers=intruder).json()["sessions"] == []


def test_humanizer_history_run_cannot_be_deleted_or_listed_by_another_user(client, unique_email):
    _use_real_humanizer_and_document_services()
    owner, intruder = _two_users(client, unique_email)
    run_id = client.post(
        "/api/v1/humanizer/runs",
        json={"input_text": "secret input", "output_text": "secret output", "style": "normal"},
        headers=owner,
    ).json()["id"]

    assert client.delete(f"/api/v1/humanizer/runs/{run_id}", headers=intruder).status_code in (403, 404)
    assert client.get("/api/v1/humanizer/runs", headers=intruder).json()["total"] == 0
    assert client.get("/api/v1/humanizer/runs", headers=owner).json()["total"] == 1


def test_document_status_pin_and_file_are_refused_for_a_non_owner(client, unique_email):
    _use_real_humanizer_and_document_services()
    owner, intruder = _two_users(client, unique_email)
    stored = f"{uuid.uuid4().hex}.pdf"
    with TestingSessionLocal() as db:
        db.add(
            Document(
                user_email=unique_email,
                original_filename="private.pdf",
                stored_filename=stored,
                content_type="application/pdf",
                size_bytes=10,
                checksum_sha256="0" * 64,
                upload_status="ready",
            )
        )
        db.commit()

    # Sanity: the real owner passes the ownership check, so the refusals below are meaningful
    # (a 404 from a typo'd ID would otherwise "prove" nothing).
    assert client.get(f"/api/v1/documents/{stored}/status", headers=owner).status_code == 200

    assert client.get(f"/api/v1/documents/{stored}/status", headers=intruder).status_code in (403, 404)
    assert client.patch(f"/api/v1/documents/{stored}/pin", json={"pinned": True}, headers=intruder).status_code in (403, 404)
    assert client.get(f"/api/v1/documents/{stored}/file", headers=intruder).status_code in (403, 404)

    # The intruder's pin attempt changed nothing for the owner.
    with TestingSessionLocal() as db:
        assert db.query(Document).filter(Document.stored_filename == stored).one().pinned in (False, None)
    assert [d for d in client.get("/api/v1/documents", headers=intruder).json()["documents"] if d["filename"] == "private.pdf"] == []
