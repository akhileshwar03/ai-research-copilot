"""Shared schemas and helpers for the admin route modules."""

import logging
import time
from datetime import datetime, timezone

from pydantic import BaseModel


logger = logging.getLogger(__name__)

_STARTED_AT = time.time()


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── Schemas ────────────────────────────────────────────────────────────────────

class AdminStats(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    suspended_users: int
    new_users_7d: int
    total_documents: int
    failed_documents: int
    total_storage_bytes: int
    total_sessions: int
    total_messages: int
    total_humanizer_runs: int
    total_realtime_sessions: int
    requests_24h: int
    errors_24h: int
    active_users_24h: int


class AdminUser(BaseModel):
    id: int
    email: str
    is_active: bool
    is_admin: bool
    email_verified: bool
    created_at: datetime | None
    document_count: int
    session_count: int
    last_active_at: datetime | None = None


class AdminUserList(BaseModel):
    users: list[AdminUser]
    total: int
    skip: int
    limit: int


class UserPatch(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None
    email_verified: bool | None = None


class SettingDescriptor(BaseModel):
    key: str
    value: bool | int | float | str
    default: bool | int | float | str
    min: float
    max: float
    type: str
    category: str
    category_label: str
    description: str
    choices: list[str] | None = None


class SettingsUpdate(BaseModel):
    settings: dict[str, bool | int | float | str]


class MessageResponse(BaseModel):
    message: str


class AdminDocument(BaseModel):
    id: str
    name: str
    owner_email: str | None
    size_bytes: int
    upload_status: str
    error_message: str | None
    page_count: int | None
    pinned: bool
    created_at: datetime | None


class AdminDocumentList(BaseModel):
    documents: list[AdminDocument]
    total: int
    skip: int
    limit: int


class AuditEntry(BaseModel):
    id: int
    admin_email: str
    action: str
    target: str | None
    details: str | None
    created_at: datetime | None


class AuditLogResponse(BaseModel):
    entries: list[AuditEntry]
    total: int
    skip: int
    limit: int


class UsageEventOut(BaseModel):
    id: int
    tool: str
    user_email: str | None
    status_code: int
    ok: bool
    duration_ms: int
    request_id: str | None
    created_at: datetime | None


class UsageEventList(BaseModel):
    events: list[UsageEventOut]
    total: int
    skip: int
    limit: int


