"""DocumentService.initiate_upload's is_new flag — fixes a real, reproduced
race condition: two uploads of identical content (same user) landing close
together, the second while the first's background ingestion is still
"processing", used to both return upload_status == "processing", which was
exactly the signal routes/upload.py used to decide whether to schedule
background ingestion — so both calls scheduled it, running process_pdf
twice for the same document and inserting every chunk (including any
vision-captioned ones, doubling that cost) twice into the vector store.

Confirmed live: two real uploads of identical 40-page/10-chart-page content,
seconds apart, produced two `background_ingestion_complete` log lines for
the same stored_filename and exactly double the expected chunk count.
"""

import asyncio
import io

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from app.core.exceptions import AppError
from app.db.repositories.document_repository import DocumentRepository
from app.services.document_service import DocumentService


def _run(coro):
    return asyncio.run(coro)


class FakeStorage:
    def __init__(self):
        self.saved: dict[str, bytes] = {}

    def save(self, stored_filename, content):
        self.saved[stored_filename] = content

    def exists(self, stored_filename):
        return stored_filename in self.saved

    def read(self, stored_filename):
        return self.saved[stored_filename]

    def delete(self, stored_filename):
        self.saved.pop(stored_filename, None)

    def presigned_url(self, stored_filename, filename, expires_in=300):
        return None


def _make_upload_file(name: str, content: bytes) -> UploadFile:
    return UploadFile(filename=name, file=io.BytesIO(content), headers=Headers({"content-type": "application/pdf"}))


def _make_service(db_session):
    return DocumentService(
        document_repo=DocumentRepository(db_session),
        ingestion_service=None,  # unused by initiate_upload
        vector_store=None,  # unused by initiate_upload
        storage=FakeStorage(),
    )


def _upload(service, name: str, content: bytes, user_email: str) -> dict:
    return _run(service.initiate_upload(_make_upload_file(name, content), user_email=user_email))


def test_first_upload_of_new_content_is_new(db_session):
    service = _make_service(db_session)
    result = _upload(service, "a.pdf", b"%PDF-1.4 unique content one", "user@example.com")
    assert result["is_new"] is True


def test_duplicate_upload_of_identical_content_is_not_new(db_session):
    """The exact race: a second upload of byte-identical content for the
    same user — even while the first is still "processing" — must be
    flagged is_new=False so the caller doesn't schedule a second ingestion."""
    service = _make_service(db_session)
    content = b"%PDF-1.4 unique content two"
    first = _upload(service, "a.pdf", content, "user@example.com")
    second = _upload(service, "a-again.pdf", content, "user@example.com")

    assert first["is_new"] is True
    assert second["is_new"] is False
    # Both calls resolve to the same document — the point of dedup at all.
    assert second["document_id"] == first["document_id"]
    # The duplicate branch still reports whatever status the row actually
    # has right now (e.g. "processing" if ingestion hasn't finished) — it's
    # is_new, not upload_status, that must be used to gate scheduling.
    assert second["upload_status"] == "processing"


def test_different_content_different_name_same_user_is_new(db_session):
    """Sanity check the dedup key is really content, not just user."""
    service = _make_service(db_session)
    first = _upload(service, "a.pdf", b"%PDF-1.4 content A", "user@example.com")
    second = _upload(service, "b.pdf", b"%PDF-1.4 content B (different)", "user@example.com")

    assert first["is_new"] is True
    assert second["is_new"] is True
    assert second["document_id"] != first["document_id"]


def test_identical_content_different_users_is_new_for_each(db_session):
    """Per-user dedup scoping — one user's upload must never dedupe against
    a different user's identical file."""
    service = _make_service(db_session)
    content = b"%PDF-1.4 shared content"
    first = _upload(service, "a.pdf", content, "user-one@example.com")
    second = _upload(service, "a.pdf", content, "user-two@example.com")

    assert first["is_new"] is True
    assert second["is_new"] is True
    assert second["document_id"] != first["document_id"]


# ── Same-name, different-content uploads must be rejected ────────────────────
# Previously dedup was purely content-based (checksum) — two genuinely
# different files uploaded under the same name both silently succeeded as
# two separate, identically-labelled documents with no way to tell them
# apart in the sidebar.

def test_same_name_different_content_same_user_is_rejected(db_session):
    service = _make_service(db_session)
    _upload(service, "notes.pdf", b"%PDF-1.4 first version", "user@example.com")

    with pytest.raises(AppError) as exc_info:
        _upload(service, "notes.pdf", b"%PDF-1.4 a totally different file", "user@example.com")

    assert exc_info.value.code == "DUPLICATE_NAME"
    assert exc_info.value.status_code == 409
    assert "notes.pdf" in exc_info.value.message


def test_same_name_different_case_different_content_is_rejected(db_session):
    """Name uniqueness is case-insensitive — "Notes.pdf" and "notes.pdf"
    must not be treated as different names."""
    service = _make_service(db_session)
    _upload(service, "Notes.pdf", b"%PDF-1.4 first version", "user@example.com")

    with pytest.raises(AppError) as exc_info:
        _upload(service, "notes.pdf", b"%PDF-1.4 different content entirely", "user@example.com")

    assert exc_info.value.code == "DUPLICATE_NAME"


def test_same_name_same_content_still_goes_through_checksum_dedup(db_session):
    """Identical name AND identical content must hit the existing, friendlier
    checksum-dedup path (silently reuse the existing document) — not the new
    name-collision rejection. The name check only fires once the checksum
    check has already ruled out "this is actually the same file"."""
    service = _make_service(db_session)
    content = b"%PDF-1.4 exact same bytes"
    first = _upload(service, "notes.pdf", content, "user@example.com")
    second = _upload(service, "notes.pdf", content, "user@example.com")

    assert first["is_new"] is True
    assert second["is_new"] is False
    assert second["document_id"] == first["document_id"]


def test_same_name_different_content_different_users_is_allowed(db_session):
    """Name uniqueness is scoped per-user — two different users can each
    have their own "notes.pdf" without colliding."""
    service = _make_service(db_session)
    first = _upload(service, "notes.pdf", b"%PDF-1.4 user ones notes", "user-one@example.com")
    second = _upload(service, "notes.pdf", b"%PDF-1.4 user twos notes", "user-two@example.com")

    assert first["is_new"] is True
    assert second["is_new"] is True
    assert second["document_id"] != first["document_id"]


def test_rejected_upload_does_not_write_to_storage(db_session):
    """A rejected duplicate-name upload must not leave an orphaned file
    behind in storage — the collision check runs before the file is saved."""
    service = _make_service(db_session)
    _upload(service, "notes.pdf", b"%PDF-1.4 first version", "user@example.com")
    storage_after_first = dict(service.storage.saved)

    with pytest.raises(AppError):
        _upload(service, "notes.pdf", b"%PDF-1.4 second, rejected version", "user@example.com")

    assert service.storage.saved == storage_after_first
