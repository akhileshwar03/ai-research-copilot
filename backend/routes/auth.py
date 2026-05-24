from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse

from app.api.dependencies.services import get_auth_service, get_otp_service
from app.core.config import get_settings
from app.schemas.auth import AuthRequest, RefreshRequest, SendOtpRequest, VerifyOtpRequest
from app.services.auth_service import AuthService
from app.services.otp_service import OtpService

router = APIRouter()


# ── Password-based auth ────────────────────────────────────────────────────────

@router.post("/register")
def register(request: AuthRequest, service: AuthService = Depends(get_auth_service)):
    return service.register(email=request.email, password=request.password)


@router.post("/login")
def login(request: AuthRequest, service: AuthService = Depends(get_auth_service)):
    return service.login(email=request.email, password=request.password)


@router.post("/refresh")
def refresh(request: RefreshRequest, service: AuthService = Depends(get_auth_service)):
    return service.refresh(refresh_token=request.refresh_token)


# ── OTP auth ───────────────────────────────────────────────────────────────────

@router.post("/auth/send-otp")
def send_otp(request: SendOtpRequest, service: OtpService = Depends(get_otp_service)):
    return service.send_otp(email=request.email)


@router.post("/auth/verify-otp")
def verify_otp(request: VerifyOtpRequest, service: OtpService = Depends(get_otp_service)):
    return service.verify_otp(email=request.email, code=request.code, password=request.password)


# ── OAuth provider discovery ──────────────────────────────────────────────────

@router.get("/auth/oauth/providers")
def oauth_providers():
    """Returns which OAuth providers are configured. Used by the frontend to
    disable/show buttons for unconfigured providers without navigating away."""
    settings = get_settings()
    return {
        "google": bool(settings.google_client_id and settings.google_client_secret),
        "apple": bool(settings.apple_client_id and settings.apple_team_id),
        "facebook": bool(settings.facebook_app_id and settings.facebook_app_secret),
    }


# ── OAuth stubs (activate by setting provider credentials in .env) ─────────────

@router.get("/auth/oauth/google")
def oauth_google():
    settings = get_settings()
    if not settings.google_client_id:
        from app.core.exceptions import AppError
        raise AppError(
            code="OAUTH_NOT_CONFIGURED",
            message="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
            status_code=501,
        )
    params = (
        f"client_id={settings.google_client_id}"
        f"&redirect_uri={settings.frontend_url}/auth/callback/google"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        "&access_type=offline"
    )
    return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/auth/oauth/facebook")
def oauth_facebook():
    settings = get_settings()
    if not settings.facebook_app_id:
        from app.core.exceptions import AppError
        raise AppError(
            code="OAUTH_NOT_CONFIGURED",
            message="Facebook OAuth is not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET.",
            status_code=501,
        )
    params = (
        f"client_id={settings.facebook_app_id}"
        f"&redirect_uri={settings.frontend_url}/auth/callback/facebook"
        "&scope=email,public_profile"
    )
    return RedirectResponse(url=f"https://www.facebook.com/v18.0/dialog/oauth?{params}")


@router.get("/auth/oauth/apple")
def oauth_apple():
    settings = get_settings()
    if not settings.apple_client_id:
        from app.core.exceptions import AppError
        raise AppError(
            code="OAUTH_NOT_CONFIGURED",
            message="Apple OAuth is not configured. Set APPLE_CLIENT_ID and related vars.",
            status_code=501,
        )
    params = (
        f"client_id={settings.apple_client_id}"
        f"&redirect_uri={settings.frontend_url}/auth/callback/apple"
        "&response_type=code%20id_token"
        "&scope=email%20name"
        "&response_mode=form_post"
    )
    return RedirectResponse(url=f"https://appleid.apple.com/auth/authorize?{params}")
