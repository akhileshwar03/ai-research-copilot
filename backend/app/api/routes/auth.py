import logging

from fastapi import APIRouter, Depends, Request, Response

from app.api.dependencies.services import get_auth_service, get_otp_service
from app.api.dependencies.auth import get_current_user, get_current_user_email
from app.db.models.user import User
from app.core.cookies import clear_refresh_cookie, get_refresh_cookie, set_refresh_cookie
from app.core.exceptions import AppError
from app.core.rate_limit import limiter
from app.schemas.auth import (
    MeResponse,
    MessageResponse,
    RefreshRequest,
    RefreshResponse,
    SendOtpRequest,
    SendOtpResponse,
    VerifyOtpRequest,
    VerifyOtpResponse,
)
from app.services.auth_service import AuthService
from app.services.otp_service import OtpService

router = APIRouter()
logger = logging.getLogger(__name__)


# There is no password-based auth in this app. Sign-in is email OTP
# (below) or OAuth (see app/api/routes/oauth.py) — nothing else.


@router.post("/refresh", response_model=RefreshResponse)
@limiter.limit("30/minute")
def refresh(
    request: Request,
    body: RefreshRequest | None = None,
    service: AuthService = Depends(get_auth_service),
):
    # Prefer the httpOnly cookie; fall back to the request body.
    token = get_refresh_cookie(request) or (body.refresh_token if body else None)
    if not token:
        raise AppError(code="MISSING_REFRESH_TOKEN", message="No refresh token provided", status_code=401)
    return service.refresh(refresh_token=token)


@router.post("/auth/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    service: AuthService = Depends(get_auth_service),
):
    """Revoke the refresh token (cookie or body) and clear the cookie."""
    token = get_refresh_cookie(request) or (body.refresh_token if body else None)
    result = service.logout(refresh_token=token)
    clear_refresh_cookie(response)
    return result


@router.get("/auth/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)):
    """Current user profile — the frontend uses is_admin to gate the admin panel."""
    return {
        "email": user.email,
        "is_admin": user.is_admin,
        "email_verified": user.email_verified,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.delete("/auth/account", response_model=MessageResponse)
def delete_account(
    email: str = Depends(get_current_user_email),
    service: AuthService = Depends(get_auth_service),
):
    """Permanently delete the authenticated user's account and all data."""
    return service.delete_account(email=email)


# ── OTP auth ───────────────────────────────────────────────────────────────────

@router.post("/auth/send-otp", response_model=SendOtpResponse)
@limiter.limit("3/minute")
def send_otp(request: Request, body: SendOtpRequest, service: OtpService = Depends(get_otp_service)):
    return service.send_otp(email=body.email)


@router.post("/auth/verify-otp", response_model=VerifyOtpResponse)
@limiter.limit("10/minute")
def verify_otp(
    request: Request,
    response: Response,
    body: VerifyOtpRequest,
    service: OtpService = Depends(get_otp_service),
):
    result = service.verify_otp(email=body.email, code=body.code)
    set_refresh_cookie(response, result["refresh_token"])
    return result
