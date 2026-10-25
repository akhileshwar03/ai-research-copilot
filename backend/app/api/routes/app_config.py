"""Public, unauthenticated runtime configuration for the frontend.

Exposes only what a signed-out visitor is allowed to know: which tools are
switched on, whether sign-ups are open, whether the platform is in
maintenance mode, the current announcement banner, whether/where the
landing page's GitHub link should point, and each page's background mode.
Numeric limits and everything else stay admin-only.
"""

import mimetypes
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies.tools import TOOL_SETTING_KEYS
from app.core.exceptions import AppError
from app.db.models.app_setting import AppSetting
from app.db.session import get_db
from app.services.runtime_settings import BACKGROUND_PAGES, runtime_settings
from app.services.storage_service import get_storage_service

router = APIRouter(prefix="/app", tags=["app"])

_BG_IMAGE_KEY_PREFIX = "_bg_image_"
_LOGO_IMAGE_KEY = "_logo_image_"
_FOUNDER_PHOTO_KEY = "_founder_photo_"


class BackgroundConfig(BaseModel):
    mode: str
    image_url: str | None


class PublicAppConfig(BaseModel):
    tools: dict[str, bool]
    signups_enabled: bool
    maintenance_mode: bool
    announcement: str
    chat_max_chars: int
    humanize_max_words: int
    checker_max_chars: int
    max_upload_size_mb: int
    github_link_enabled: bool
    github_repo_url: str
    support_email: str
    legal_entity_name: str
    logo_url: str | None
    backgrounds: dict[str, BackgroundConfig]


class LegalContent(BaseModel):
    content: str


class FounderLink(BaseModel):
    kind: Literal["linkedin", "github", "x", "website"]
    label: str
    url: str


class FounderPublic(BaseModel):
    enabled: bool
    name: str
    title: str
    note: str
    photo_url: str | None
    links: list[FounderLink]


@router.get("/config", response_model=PublicAppConfig)
def public_app_config(db: Session = Depends(get_db)):
    backgrounds: dict[str, BackgroundConfig] = {}
    for page in BACKGROUND_PAGES:
        mode = str(runtime_settings.get(f"bg_mode_{page}"))
        row = db.get(AppSetting, f"{_BG_IMAGE_KEY_PREFIX}{page}")
        image_url = None
        if row:
            # 2026-09-20: real bug, found live -- re-uploading a page's image left
            # the OLD one showing, because the URL path never changes between
            # uploads and the route below sets a 1-hour Cache-Control. The browser
            # never even asked the server again. `?v=<stored key>` fixes it: the
            # stored key is fresh per upload (a new uuid4, see admin.py's upload
            # route), so a re-upload is a genuinely different URL, which is what
            # actually busts the cache -- the query string itself is ignored by
            # the route below, it exists purely so the URL changes.
            version = row.value.rsplit("/", 1)[-1]
            # Relative to the API root, NOT prefixed with /api/v1 -- the frontend
            # adds that itself (buildApiUrl), same as every other endpoint path in
            # PublicAppConfig; hardcoding it here would double up whenever the
            # frontend's own prefix is also /api/v1 (the local-dev default). Only
            # ever a same-origin path, never a stored-object key or presigned URL
            # -- the actual bytes are fetched through the streaming route below,
            # so the storage backend (R2) stays private either way.
            image_url = f"/app/background/{page}?v={version}"
        backgrounds[page] = BackgroundConfig(mode=mode, image_url=image_url)

    logo_row = db.get(AppSetting, _LOGO_IMAGE_KEY)
    logo_url = f"/app/logo?v={logo_row.value.rsplit('/', 1)[-1]}" if logo_row else None

    return PublicAppConfig(
        tools={tool: bool(runtime_settings.get(key)) for tool, key in TOOL_SETTING_KEYS.items()},
        signups_enabled=bool(runtime_settings.get("signups_enabled")),
        maintenance_mode=bool(runtime_settings.get("maintenance_mode")),
        announcement=str(runtime_settings.get("announcement_text") or ""),
        chat_max_chars=int(runtime_settings.get("chat_max_chars")),
        humanize_max_words=int(runtime_settings.get("humanize_max_words")),
        checker_max_chars=int(runtime_settings.get("checker_max_chars")),
        max_upload_size_mb=int(runtime_settings.get("max_upload_size_mb")),
        github_link_enabled=bool(runtime_settings.get("github_link_enabled")),
        github_repo_url=str(runtime_settings.get("github_repo_url") or ""),
        support_email=str(runtime_settings.get("support_email") or ""),
        legal_entity_name=str(runtime_settings.get("legal_entity_name") or "Querex"),
        logo_url=logo_url,
        backgrounds=backgrounds,
    )


@router.get("/legal/privacy", response_model=LegalContent)
def public_privacy_policy():
    return LegalContent(content=str(runtime_settings.get("privacy_policy_content") or ""))


@router.get("/legal/terms", response_model=LegalContent)
def public_terms_of_service():
    return LegalContent(content=str(runtime_settings.get("terms_of_service_content") or ""))


@router.get("/background/{page}")
def public_background_image(page: str, db: Session = Depends(get_db)):
    """Streams an admin-uploaded background image to any visitor, without the
    object storage backend itself ever being publicly readable (R2 stays on
    presigned/private access everywhere else -- see storage_service.py). The
    stored object key is versioned per upload (see admin.py's upload route),
    so this is safe to cache aggressively; a new upload is a new URL-worthy
    key even though the path here doesn't change, so callers should treat a
    changed `backgrounds[page].image_url`'s underlying bytes as the real
    cache-buster and add their own query param if they need one client-side."""
    if page not in BACKGROUND_PAGES:
        raise AppError(code="UNKNOWN_PAGE", message=f"Unknown page: {page}", status_code=404)
    row = db.get(AppSetting, f"{_BG_IMAGE_KEY_PREFIX}{page}")
    if not row:
        raise AppError(code="NOT_FOUND", message="No background image set for this page", status_code=404)

    content = get_storage_service().read(row.value)
    content_type = mimetypes.guess_type(row.value)[0] or "application/octet-stream"
    return Response(content=content, media_type=content_type, headers={"Cache-Control": "public, max-age=3600"})


@router.get("/logo")
def public_logo(db: Session = Depends(get_db)):
    """Streams the admin-uploaded brand logo, same pattern as
    public_background_image above."""
    row = db.get(AppSetting, _LOGO_IMAGE_KEY)
    if not row:
        raise AppError(code="NOT_FOUND", message="No logo has been uploaded", status_code=404)

    content = get_storage_service().read(row.value)
    content_type = mimetypes.guess_type(row.value)[0] or "application/octet-stream"
    return Response(content=content, media_type=content_type, headers={"Cache-Control": "public, max-age=3600"})


# ── Founder note ──────────────────────────────────────────────────────────────
# 2026-10-25: strictly opt-in. The section is only ever published when the admin switched it on AND
# entered a name and a note; otherwise this returns enabled=false with every field empty, so nothing
# (not even an uploaded photo) leaks while the section is off or half-finished.
_FOUNDER_LINKS = (
    ("founder_linkedin_url", "linkedin", "LinkedIn"),
    ("founder_github_url", "github", "GitHub"),
    ("founder_x_url", "x", "X"),
    ("founder_website_url", "website", "Website"),
)


def _founder_publishable() -> bool:
    return bool(
        runtime_settings.get("founder_section_enabled")
        and str(runtime_settings.get("founder_name") or "").strip()
        and str(runtime_settings.get("founder_note") or "").strip()
    )


@router.get("/founder", response_model=FounderPublic)
def public_founder(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=60"
    if not _founder_publishable():
        return FounderPublic(enabled=False, name="", title="", note="", photo_url=None, links=[])

    photo_row = db.get(AppSetting, _FOUNDER_PHOTO_KEY)
    return FounderPublic(
        enabled=True,
        name=str(runtime_settings.get("founder_name")),
        title=str(runtime_settings.get("founder_title") or ""),
        note=str(runtime_settings.get("founder_note")),
        photo_url=f"/app/founder/photo?v={photo_row.value.rsplit('/', 1)[-1]}" if photo_row else None,
        links=[
            FounderLink(kind=kind, label=label, url=str(runtime_settings.get(key)))
            for key, kind, label in _FOUNDER_LINKS
            if str(runtime_settings.get(key) or "").strip()
        ],
    )


@router.get("/founder/photo")
def public_founder_photo(db: Session = Depends(get_db)):
    """The photo is served only while the section is actually published (an uploaded photo for a switched-off
    section is not public). Same streaming pattern as the logo; the key is versioned per upload."""
    row = db.get(AppSetting, _FOUNDER_PHOTO_KEY)
    if not row or not _founder_publishable():
        raise AppError(code="NOT_FOUND", message="No founder photo", status_code=404)
    content = get_storage_service().read(row.value)
    # Five minutes, not the logo's hour: this one can be un-published, and a cached copy outlives that.
    return Response(content=content, media_type="image/webp", headers={"Cache-Control": "public, max-age=300"})
