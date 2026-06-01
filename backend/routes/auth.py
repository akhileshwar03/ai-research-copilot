import logging

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse

from app.api.dependencies.services import get_auth_service, get_otp_service
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.api.dependencies.auth import get_current_user_email
from app.schemas.auth import AuthRequest, ChangePasswordRequest, RefreshRequest, ResetPasswordRequest, SendOtpRequest, VerifyOtpRequest, SignupRequest
from app.services.auth_service import AuthService
from app.services.otp_service import OtpService

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()


# ── Password auth ──────────────────────────────────────────────────────────────

@router.post("/register")
def register(request: AuthRequest, service: AuthService = Depends(get_auth_service)):
    return service.register(email=request.email, password=request.password)


@router.post("/login")
def login(request: AuthRequest, service: AuthService = Depends(get_auth_service)):
    return service.login(email=request.email, password=request.password)


@router.post("/refresh")
def refresh(request: RefreshRequest, service: AuthService = Depends(get_auth_service)):
    return service.refresh(refresh_token=request.refresh_token)


# ── Signup with email verification ─────────────────────────────────────────────

@router.post("/auth/signup")
def signup(request: SignupRequest, service: AuthService = Depends(get_auth_service)):
    """Step 1 of signup: validate uniqueness. Frontend then calls /auth/send-otp."""
    return service.signup_request(email=request.email, password=request.password)


# ── Password management ────────────────────────────────────────────────────────

@router.post("/auth/change-password")
def change_password(
    request: ChangePasswordRequest,
    email: str = Depends(get_current_user_email),
    service: AuthService = Depends(get_auth_service),
):
    return service.change_password(
        email=email,
        current_password=request.current_password,
        new_password=request.new_password,
    )


@router.post("/auth/forgot-password/send")
def forgot_password_send(request: SendOtpRequest, service: OtpService = Depends(get_otp_service)):
    """Forgot-password step 1: send OTP only if the account exists (no email-existence leak)."""
    return service.send_otp(email=request.email, require_existing_account=True)


@router.post("/auth/reset-password")
def reset_password(request: ResetPasswordRequest, service: OtpService = Depends(get_otp_service)):
    """Forgot-password step 2: verify OTP and set a new password."""
    return service.reset_password(
        email=request.email,
        code=request.code,
        new_password=request.new_password,
    )


@router.delete("/auth/account")
def delete_account(
    email: str = Depends(get_current_user_email),
    service: AuthService = Depends(get_auth_service),
):
    """Permanently delete the authenticated user's account and all data."""
    return service.delete_account(email=email)


# ── OTP auth ───────────────────────────────────────────────────────────────────

@router.post("/auth/send-otp")
def send_otp(request: SendOtpRequest, service: OtpService = Depends(get_otp_service)):
    return service.send_otp(email=request.email)


@router.post("/auth/verify-otp")
def verify_otp(request: VerifyOtpRequest, service: OtpService = Depends(get_otp_service)):
    return service.verify_otp(email=request.email, code=request.code, password=request.password)


# ── OAuth provider discovery ───────────────────────────────────────────────────

@router.get("/auth/oauth/providers")
def oauth_providers():
    s = get_settings()
    return {
        "google":   bool(s.google_client_id and s.google_client_secret),
        "apple":    bool(s.apple_client_id and s.apple_team_id),
        "facebook": bool(s.facebook_app_id and s.facebook_app_secret),
    }


# ── Google OAuth ───────────────────────────────────────────────────────────────

@router.get("/auth/oauth/google")
def oauth_google():
    s = get_settings()
    if not s.google_client_id:
        raise AppError(code="OAUTH_NOT_CONFIGURED", message="Google OAuth is not configured.", status_code=501)
    redirect_uri = f"{s.app_base_url}/auth/callback/google"
    params = (
        f"client_id={s.google_client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        "&access_type=offline"
        "&prompt=select_account"
    )
    return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/auth/callback/google")
def callback_google(code: str, service: AuthService = Depends(get_auth_service)):
    s = get_settings()
    redirect_uri = f"{s.app_base_url}/auth/callback/google"

    # Exchange code for tokens
    try:
        token_resp = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": s.google_client_id,
                "client_secret": s.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()
    except Exception as exc:
        logger.error("google_token_exchange_failed: %s", exc)
        return RedirectResponse(url=f"{s.frontend_url}/login?error=google_auth_failed")

    # Fetch user info
    try:
        user_resp = httpx.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
            timeout=10,
        )
        user_resp.raise_for_status()
        user_info = user_resp.json()
    except Exception as exc:
        logger.error("google_userinfo_failed: %s", exc)
        return RedirectResponse(url=f"{s.frontend_url}/login?error=google_auth_failed")

    email = user_info.get("email")
    if not email:
        return RedirectResponse(url=f"{s.frontend_url}/login?error=no_email")

    tokens = service.login_or_create_oauth_user(
        email=email,
        provider="google",
        provider_subject=user_info["id"],
    )
    return RedirectResponse(
        url=f"{s.frontend_url}/auth/callback"
        f"?token={tokens['access_token']}"
        f"&refresh_token={tokens['refresh_token']}"
        f"&is_new_user={str(tokens.get('is_new_user', False)).lower()}"
    )


# ── Facebook OAuth ─────────────────────────────────────────────────────────────

@router.get("/auth/oauth/facebook")
def oauth_facebook():
    s = get_settings()
    if not s.facebook_app_id:
        raise AppError(code="OAUTH_NOT_CONFIGURED", message="Facebook OAuth is not configured.", status_code=501)
    redirect_uri = f"{s.app_base_url}/auth/callback/facebook"
    params = (
        f"client_id={s.facebook_app_id}"
        f"&redirect_uri={redirect_uri}"
        "&scope=email,public_profile"
        "&response_type=code"
    )
    return RedirectResponse(url=f"https://www.facebook.com/v19.0/dialog/oauth?{params}")


@router.get("/auth/callback/facebook")
def callback_facebook(code: str, service: AuthService = Depends(get_auth_service)):
    s = get_settings()
    redirect_uri = f"{s.app_base_url}/auth/callback/facebook"

    try:
        token_resp = httpx.get(
            "https://graph.facebook.com/v19.0/oauth/access_token",
            params={
                "client_id": s.facebook_app_id,
                "client_secret": s.facebook_app_secret,
                "redirect_uri": redirect_uri,
                "code": code,
            },
            timeout=10,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]
    except Exception as exc:
        logger.error("facebook_token_exchange_failed: %s", exc)
        return RedirectResponse(url=f"{s.frontend_url}/login?error=facebook_auth_failed")

    try:
        user_resp = httpx.get(
            "https://graph.facebook.com/me",
            params={"fields": "id,email,name", "access_token": access_token},
            timeout=10,
        )
        user_resp.raise_for_status()
        user_info = user_resp.json()
    except Exception as exc:
        logger.error("facebook_userinfo_failed: %s", exc)
        return RedirectResponse(url=f"{s.frontend_url}/login?error=facebook_auth_failed")

    email = user_info.get("email")
    if not email:
        return RedirectResponse(url=f"{s.frontend_url}/login?error=no_email")

    tokens = service.login_or_create_oauth_user(
        email=email, provider="facebook", provider_subject=user_info["id"],
    )
    return RedirectResponse(
        url=f"{s.frontend_url}/auth/callback"
        f"?token={tokens['access_token']}"
        f"&refresh_token={tokens['refresh_token']}"
        f"&is_new_user={str(tokens.get('is_new_user', False)).lower()}"
    )


# ── Apple OAuth (stub — requires paid Apple Developer account) ─────────────────

@router.get("/auth/oauth/apple")
def oauth_apple():
    s = get_settings()
    if not s.apple_client_id:
        raise AppError(code="OAUTH_NOT_CONFIGURED", message="Apple OAuth is not configured.", status_code=501)
    redirect_uri = f"{s.app_base_url}/auth/callback/apple"
    params = (
        f"client_id={s.apple_client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code%20id_token"
        "&scope=name%20email"
        "&response_mode=form_post"
    )
    return RedirectResponse(url=f"https://appleid.apple.com/auth/authorize?{params}")
