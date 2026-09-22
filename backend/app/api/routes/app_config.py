"""Public, unauthenticated runtime configuration for the frontend.

Exposes only what a signed-out visitor is allowed to know: which tools are
switched on, whether sign-ups are open, whether the platform is in
maintenance mode, the current announcement banner, whether/where the
landing page's GitHub link should point, and each page's background mode.
Numeric limits and everything else stay admin-only.
"""

import mimetypes

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
    github_link_enabled: bool
    github_repo_url: str
    support_email: str
    legal_entity_name: str
    logo_url: str | None
    backgrounds: dict[str, BackgroundConfig]


class LegalContent(BaseModel):
    content: str


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
