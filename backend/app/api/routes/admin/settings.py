"""Runtime settings, page backgrounds and brand logo."""

import io
import logging
import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from PIL import Image
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin
from app.core.exceptions import AppError
from app.db.models.app_setting import AppSetting
from app.db.models.user import User
from app.db.session import get_db
from app.services.admin_audit import record_admin_action
from app.services.runtime_settings import BACKGROUND_PAGES, CATEGORY_LABELS, describe_settings, runtime_settings
from app.services.storage_service import get_storage_service
from app.api.routes.admin._common import (
    SettingDescriptor,
    SettingsUpdate,
    MessageResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Runtime settings ───────────────────────────────────────────────────────────

@router.get("/settings", response_model=list[SettingDescriptor])
def get_runtime_settings(admin: User = Depends(require_admin)):
    return describe_settings()


@router.put("/settings", response_model=list[SettingDescriptor])
def update_runtime_settings(
    body: SettingsUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    # A page can never be saved into "static" mode with nothing to show --
    # enforced here, not just left to the admin UI's own upload-before-save
    # gating, so a direct API call can't create the broken state either.
    for key, value in body.settings.items():
        if key.startswith("bg_mode_") and value == "static":
            page = key[len("bg_mode_"):]
            if db.get(AppSetting, f"{_BG_IMAGE_KEY_PREFIX}{page}") is None:
                raise AppError(
                    code="NO_BACKGROUND_IMAGE",
                    message=f"Upload an image for {page.replace('_', ' ')} before switching it to static.",
                    status_code=400,
                )
    for key, value in body.settings.items():
        runtime_settings.set(db, key, value)
    record_admin_action(db, admin_email=admin.email, action="settings.update", details=dict(body.settings))
    return describe_settings()


@router.get("/settings/categories")
def get_setting_categories(admin: User = Depends(require_admin)):
    return [{"key": key, "label": label} for key, label in CATEGORY_LABELS.items()]


# ── Per-page background images ──────────────────────────────────────────────────
# 2026-09-20: the image bytes live in object storage (StorageService — R2 in
# prod), never in this DB row and never in a publicly-readable bucket (that
# bucket is deliberately private, per the July security audit). This just
# tracks WHICH stored object is current for each page, as a plain AppSetting
# row keyed "_bg_image_<page>" -- written here directly rather than through
# the typed runtime_settings/_defs() system, specifically so it never shows
# up as an editable field in the generic admin Settings UI (it's bookkeeping,
# not a setting a human should hand-type). GET /app/background/{page} (see
# app_config.py) is the one place that reads it back, to stream the bytes to
# a public, unauthenticated request without the storage backend itself ever
# being public.
_BG_IMAGE_KEY_PREFIX = "_bg_image_"
_BG_MAX_BYTES = 8 * 1024 * 1024
_BG_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
# 2026-09-20: background images are full-viewport, fixed, and loaded on
# every single page view -- an admin uploading a straight-off-a-phone 4-6MB
# photo would make every visitor pay that download on first paint for a
# purely decorative element. Compressed server-side before it ever reaches
# object storage, not left to the admin to pre-shrink themselves.
_BG_TARGET_MAX_BYTES = 100 * 1024
_BG_MAX_DIMENSION = 2000  # px, longest side -- these render as a page backdrop, never viewed at native size


def _compress_background_image(content: bytes) -> bytes:
    """Resizes/recompresses to _BG_TARGET_MAX_BYTES. Always re-encodes to
    WebP regardless of the input format -- WebP's lossy mode reliably hits a
    much smaller size than PNG at a given visual quality, and one consistent
    output format keeps this simple (no per-format branching downstream:
    serving, content-type, extension). Bounded, real iteration rather than
    guessing one right quality setting: downscale first (dimensions matter
    far more than quality percentage at any acceptable quality), then step
    quality down; if even the floor quality is still over budget on an
    unusually large/detailed source, one more aggressive downscale pass
    rather than looping indefinitely chasing a target quality alone can't reach.
    Raises AppError if the bytes aren't a real image the declared content-type
    claimed them to be (Pillow can't open them)."""
    try:
        image = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as exc:
        raise AppError(code="INVALID_FILE_TYPE", message="File is not a valid image", status_code=400) from exc

    if max(image.size) > _BG_MAX_DIMENSION:
        image.thumbnail((_BG_MAX_DIMENSION, _BG_MAX_DIMENSION), Image.LANCZOS)

    for quality in (85, 75, 65, 55, 45, 35, 25, 18, 12):
        buf = io.BytesIO()
        image.save(buf, format="WEBP", quality=quality, method=6)
        data = buf.getvalue()
        if len(data) <= _BG_TARGET_MAX_BYTES:
            return data

    image.thumbnail((1200, 1200), Image.LANCZOS)
    buf = io.BytesIO()
    image.save(buf, format="WEBP", quality=12, method=6)
    return buf.getvalue()


@router.post("/background/{page}")
async def upload_background_image(
    page: str,
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if page not in BACKGROUND_PAGES:
        raise AppError(code="UNKNOWN_PAGE", message=f"Unknown page: {page}", status_code=400)
    if (file.content_type or "") not in _BG_ALLOWED_CONTENT_TYPES:
        raise AppError(
            code="INVALID_FILE_TYPE", message="Only JPEG, PNG, or WebP images are allowed", status_code=400
        )
    content = await file.read()
    if len(content) > _BG_MAX_BYTES:
        raise AppError(code="FILE_TOO_LARGE", message="Image exceeds the 8 MB limit", status_code=413)

    content = _compress_background_image(content)

    storage = get_storage_service()
    settings_key = f"{_BG_IMAGE_KEY_PREFIX}{page}"
    row = db.get(AppSetting, settings_key)
    previous_stored_key = row.value if row else None

    # Always .webp -- _compress_background_image always re-encodes to it
    # regardless of the uploaded format.
    stored_key = f"branding/background-{page}-{uuid.uuid4()}.webp"
    storage.save(stored_key, content)

    if row:
        row.value = stored_key
    else:
        db.add(AppSetting(key=settings_key, value=stored_key))
    db.commit()

    # Best-effort: an old image left behind if this fails costs storage, not
    # correctness (the new one is already live) -- not worth failing the
    # request over.
    if previous_stored_key:
        try:
            storage.delete(previous_stored_key)
        except Exception:
            logger.warning("background_image_cleanup_failed page=%s key=%s", page, previous_stored_key, exc_info=True)

    record_admin_action(db, admin_email=admin.email, action="background.upload", target=page)
    # Same versioning scheme as GET /app/config's backgrounds[page].image_url
    # (see app_config.py) -- the path never changes between uploads, so the
    # version query param is what actually busts the 1-hour browser cache on
    # a re-upload. rsplit on "/" not "-": stored_key's own uuid4 segment
    # contains hyphens, splitting on those would truncate it.
    return {"page": page, "image_url": f"/app/background/{page}?v={stored_key.rsplit('/', 1)[-1]}"}


@router.delete("/background/{page}")
def delete_background_image(page: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if page not in BACKGROUND_PAGES:
        raise AppError(code="UNKNOWN_PAGE", message=f"Unknown page: {page}", status_code=400)
    settings_key = f"{_BG_IMAGE_KEY_PREFIX}{page}"
    row = db.get(AppSetting, settings_key)
    if not row:
        raise AppError(code="NOT_FOUND", message="No image uploaded for this page", status_code=404)

    storage = get_storage_service()
    try:
        storage.delete(row.value)
    except Exception:
        logger.warning("background_image_delete_failed page=%s key=%s", page, row.value, exc_info=True)
    db.delete(row)
    # A page can't stay in "static" mode with nothing to show -- fall back to
    # dynamic automatically rather than leaving a broken image reference live.
    if runtime_settings.get(f"bg_mode_{page}") == "static":
        runtime_settings.set(db, f"bg_mode_{page}", "dynamic")
    db.commit()
    record_admin_action(db, admin_email=admin.email, action="background.delete", target=page)
    return MessageResponse(message=f"Background image removed for {page}")


# ── Brand logo ───────────────────────────────────────────────────────────────────
# 2026-09-21: same bookkeeping-row pattern as the per-page background images
# above (a single global one, not per-page) -- an admin-uploaded mark that
# replaces the built-in sparkle glyph everywhere it's shown (landing nav +
# footer, legal pages nav, the logged-in app's top nav, and the login page).
# GET /app/logo (app_config.py) streams it back publicly, unauthenticated,
# same as the background route.
_LOGO_IMAGE_KEY = "_logo_image_"
_LOGO_MAX_BYTES = 4 * 1024 * 1024
_LOGO_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
# Small and typically viewed at ~32-40px, but rendered at up to 2x for retina
# -- 512px is generous headroom without bloating storage/transfer for
# something shown on every single page load, everywhere.
_LOGO_TARGET_MAX_BYTES = 60 * 1024
_LOGO_MAX_DIMENSION = 512


def _compress_logo_image(content: bytes) -> bytes:
    """Same bounded resize/recompress loop as _compress_background_image, but
    keeps the alpha channel (RGBA, not RGB) -- a logo is composited over
    whatever accent color sits behind it in each placement, so transparency
    actually matters here, unlike a full-bleed page background."""
    try:
        image = Image.open(io.BytesIO(content)).convert("RGBA")
    except Exception as exc:
        raise AppError(code="INVALID_FILE_TYPE", message="File is not a valid image", status_code=400) from exc

    if max(image.size) > _LOGO_MAX_DIMENSION:
        image.thumbnail((_LOGO_MAX_DIMENSION, _LOGO_MAX_DIMENSION), Image.LANCZOS)

    for quality in (90, 80, 70, 60, 50, 40, 30, 20):
        buf = io.BytesIO()
        image.save(buf, format="WEBP", quality=quality, method=6)
        data = buf.getvalue()
        if len(data) <= _LOGO_TARGET_MAX_BYTES:
            return data

    image.thumbnail((256, 256), Image.LANCZOS)
    buf = io.BytesIO()
    image.save(buf, format="WEBP", quality=20, method=6)
    return buf.getvalue()


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if (file.content_type or "") not in _LOGO_ALLOWED_CONTENT_TYPES:
        raise AppError(
            code="INVALID_FILE_TYPE", message="Only JPEG, PNG, or WebP images are allowed", status_code=400
        )
    content = await file.read()
    if len(content) > _LOGO_MAX_BYTES:
        raise AppError(code="FILE_TOO_LARGE", message="Image exceeds the 4 MB limit", status_code=413)

    content = _compress_logo_image(content)

    storage = get_storage_service()
    row = db.get(AppSetting, _LOGO_IMAGE_KEY)
    previous_stored_key = row.value if row else None

    stored_key = f"branding/logo-{uuid.uuid4()}.webp"
    storage.save(stored_key, content)

    if row:
        row.value = stored_key
    else:
        db.add(AppSetting(key=_LOGO_IMAGE_KEY, value=stored_key))
    db.commit()

    if previous_stored_key:
        try:
            storage.delete(previous_stored_key)
        except Exception:
            logger.warning("logo_image_cleanup_failed key=%s", previous_stored_key, exc_info=True)

    record_admin_action(db, admin_email=admin.email, action="logo.upload")
    return {"logo_url": f"/app/logo?v={stored_key.rsplit('/', 1)[-1]}"}


@router.delete("/logo")
def delete_logo(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.get(AppSetting, _LOGO_IMAGE_KEY)
    if not row:
        raise AppError(code="NOT_FOUND", message="No logo has been uploaded", status_code=404)

    storage = get_storage_service()
    try:
        storage.delete(row.value)
    except Exception:
        logger.warning("logo_image_delete_failed key=%s", row.value, exc_info=True)
    db.delete(row)
    db.commit()
    record_admin_action(db, admin_email=admin.email, action="logo.delete")
    return MessageResponse(message="Logo removed — the default mark is shown again")


