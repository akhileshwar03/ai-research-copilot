"""Admin two-factor authentication (authenticator app) endpoints."""

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin_basic
from app.core.exceptions import AppError
from app.db.models.user import User
from app.db.session import get_db
from app.services import admin_2fa
from app.services.admin_audit import record_admin_action

router = APIRouter()


class CodeBody(BaseModel):
    code: str = Field(min_length=6, max_length=12)


def _check_code(db: Session, user: User, secret: str, code: str) -> None:
    if admin_2fa.is_locked_out(user.email):
        raise AppError(
            code="ADMIN_2FA_LOCKED",
            message="Too many incorrect codes. Try again in a few minutes.",
            status_code=429,
        )
    if not admin_2fa.verify_code(secret, code):
        admin_2fa.record_failure(user.email)
        record_admin_action(db, admin_email=user.email, action="admin.2fa_failed")
        raise AppError(code="ADMIN_2FA_INVALID", message="Incorrect authenticator code", status_code=400)
    admin_2fa.clear_failures(user.email)


@router.get("/2fa/status")
def two_factor_status(request: Request, admin: User = Depends(require_admin_basic)):
    """`verified` is true when this session already holds a valid step-up token (or 2FA is off)."""
    verified = (not admin.totp_enabled) or admin_2fa.step_up_token_valid(request.headers.get("X-Admin-2FA"), admin.email)
    return {"enabled": bool(admin.totp_enabled), "verified": verified}


@router.post("/2fa/setup")
def two_factor_setup(admin: User = Depends(require_admin_basic), db: Session = Depends(get_db)):
    """Start enrolment: store a fresh (not yet active) secret and return it for the authenticator app."""
    if admin.totp_enabled:
        raise AppError(code="ADMIN_2FA_ALREADY_ENABLED", message="Two-factor is already enabled", status_code=409)
    secret = admin_2fa.new_secret()
    admin.totp_secret = admin_2fa.encrypt_secret(secret)
    db.commit()
    return {"secret": secret, "otpauth_uri": admin_2fa.provisioning_uri(admin.email, secret)}


@router.post("/2fa/enable")
def two_factor_enable(body: CodeBody, admin: User = Depends(require_admin_basic), db: Session = Depends(get_db)):
    if admin.totp_enabled:
        raise AppError(code="ADMIN_2FA_ALREADY_ENABLED", message="Two-factor is already enabled", status_code=409)
    secret = admin_2fa.decrypt_secret(admin.totp_secret) if admin.totp_secret else None
    if not secret:
        raise AppError(code="ADMIN_2FA_NOT_STARTED", message="Start setup first", status_code=400)
    _check_code(db, admin, secret, body.code)
    admin.totp_enabled = True
    db.commit()
    record_admin_action(db, admin_email=admin.email, action="admin.2fa_enabled")
    return {"enabled": True, "token": admin_2fa.issue_step_up_token(admin.email)}


@router.post("/2fa/verify")
def two_factor_verify(body: CodeBody, admin: User = Depends(require_admin_basic), db: Session = Depends(get_db)):
    secret = admin_2fa.decrypt_secret(admin.totp_secret) if admin.totp_enabled and admin.totp_secret else None
    if not secret:
        raise AppError(code="ADMIN_2FA_NOT_ENABLED", message="Two-factor is not enabled", status_code=400)
    _check_code(db, admin, secret, body.code)
    return {"token": admin_2fa.issue_step_up_token(admin.email)}


@router.post("/2fa/disable")
def two_factor_disable(body: CodeBody, admin: User = Depends(require_admin_basic), db: Session = Depends(get_db)):
    secret = admin_2fa.decrypt_secret(admin.totp_secret) if admin.totp_enabled and admin.totp_secret else None
    if not secret:
        raise AppError(code="ADMIN_2FA_NOT_ENABLED", message="Two-factor is not enabled", status_code=400)
    _check_code(db, admin, secret, body.code)
    admin.totp_enabled = False
    admin.totp_secret = None
    db.commit()
    record_admin_action(db, admin_email=admin.email, action="admin.2fa_disabled")
    return {"enabled": False}
