import logging

from fastapi import APIRouter, Depends, Request, Response

from app.api.dependencies.services import get_auth_service, get_otp_service
from app.api.dependencies.auth import get_current_user, get_current_user_email
from app.db.models.user import User
from app.core.cookies import clear_refresh_cookie, get_refresh_cookie, set_refresh_cookie
from app.core.exceptions import AppError
from app.core.rate_limit import limiter
from app.schemas.auth import (
    AuthRequest,
    AuthResponse,
    ChangePasswordRequest,
    MeResponse,
    MessageResponse,
    RefreshRequest,
    RefreshResponse,
    ResetPasswordRequest,
    SendOtpRequest,
    SendOtpResponse,
    SignupRequest,
    SignupResponse,
    VerifyOtpRequest,
    VerifyOtpResponse,
)
from app.services.auth_service import AuthService
from app.services.otp_service import OtpService

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Password auth ──────────────────────────────────────────────────────────────

@router.post("/register", response_model=MessageResponse)
@limiter.limit("5/minute")
def register(request: Request, body: AuthRequest, service: AuthService = Depends(get_auth_service)):
    return service.register(email=body.email, password=body.password)


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
def login(
    request: Request,
    response: Response,
    body: AuthRequest,
    service: AuthService = Depends(get_auth_service),
):
    result = service.login(email=body.email, password=body.password)
    # httpOnly cookie is the primary refresh channel; the JSON copy exists for
    # clients where cross-site cookies are blocked (Safari ITP).
    set_refresh_cookie(response, result["refresh_token"])
    return result


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


# ── Signup with email verification ─────────────────────────────────────────────

@router.post("/auth/signup", response_model=SignupResponse)
@limiter.limit("5/minute")
def signup(request: Request, body: SignupRequest, service: AuthService = Depends(get_auth_service)):
    """Step 1 of signup: validate uniqueness + strength. Frontend then calls /auth/send-otp."""
    return service.signup_request(email=body.email, password=body.password)


@router.get("/auth/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)):
    """Current user profile — the frontend uses is_admin to gate the admin panel."""
    return {
        "email": user.email,
        "is_admin": user.is_admin,
        "email_verified": user.email_verified,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


# ── Password management ────────────────────────────────────────────────────────

@router.post("/auth/change-password", response_model=MessageResponse)
@limiter.limit("5/minute")
def change_password(
    request: Request,
    body: ChangePasswordRequest,
    email: str = Depends(get_current_user_email),
    service: AuthService = Depends(get_auth_service),
):
    return service.change_password(
        email=email,
        current_password=body.current_password,
        new_password=body.new_password,
    )


@router.post("/auth/forgot-password/send", response_model=SendOtpResponse)
@limiter.limit("3/minute")
def forgot_password_send(request: Request, body: SendOtpRequest, service: OtpService = Depends(get_otp_service)):
    """Forgot-password step 1: send OTP only if the account exists (no email-existence leak)."""
    return service.send_otp(email=body.email, require_existing_account=True)


@router.post("/auth/reset-password", response_model=MessageResponse)
@limiter.limit("5/minute")
def reset_password(request: Request, body: ResetPasswordRequest, service: OtpService = Depends(get_otp_service)):
    """Forgot-password step 2: verify OTP and set a new password."""
    return service.reset_password(
        email=body.email,
        code=body.code,
        new_password=body.new_password,
    )


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
    result = service.verify_otp(email=body.email, code=body.code, password=body.password)
    set_refresh_cookie(response, result["refresh_token"])
    return result
