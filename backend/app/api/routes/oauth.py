"""OAuth routes mounted at both root level and under /api/v1.

Root-level mount (/auth/callback/google, /auth/callback/github) is required
because OAuth provider redirect URIs are hard-coded to the domain root. The v1
mount (/api/v1/auth/...) is provided for completeness and future new provider
registrations.

Security: callbacks no longer embed tokens in the redirect URL. Instead, they
store tokens server-side under a short-lived one-time code (OAuthStateStore)
and redirect the frontend with only that code. The frontend exchanges the code
for tokens via POST /api/v1/auth/oauth/exchange — tokens never appear in any
URL, log file, or Referer header.
"""

import logging
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies.services import get_auth_service
from app.core.config import get_settings
from app.core.cookies import set_refresh_cookie
from app.core.exceptions import AppError
from app.db.session import get_db
from app.services import one_time_code_store as otc
from app.services.auth_service import AuthService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/auth/oauth/providers")
def oauth_providers():
    s = get_settings()
    return {
        "google": bool(s.google_client_id and s.google_client_secret),
        "github": bool(s.github_client_id and s.github_client_secret),
    }


# ── Google ────────────────────────────────────────────────────────────────────

@router.get("/auth/oauth/google")
def oauth_google(db: Session = Depends(get_db)):
    s = get_settings()
    if not s.google_client_id:
        raise AppError(code="OAUTH_NOT_CONFIGURED", message="Google OAuth is not configured.", status_code=501)
    redirect_uri = f"{s.app_base_url}/auth/callback/google"
    params = urlencode({
        "client_id": s.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
        "state": otc.create_code(db, otc.PURPOSE_OAUTH_STATE, None, otc.OAUTH_STATE_TTL_SECONDS),
    })
    return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/auth/callback/google")
def callback_google(
    code: str,
    state: str = "",
    service: AuthService = Depends(get_auth_service),
    db: Session = Depends(get_db),
):
    s = get_settings()
    if otc.consume_code(db, otc.PURPOSE_OAUTH_STATE, state) is None:
        logger.warning("oauth_state_invalid provider=google")
        return RedirectResponse(url=f"{s.frontend_url}/login?error=oauth_state_invalid")
    redirect_uri = f"{s.app_base_url}/auth/callback/google"

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

    # One-time code replaces tokens-in-URL (OWASP A07 mitigation).
    exchange_code = otc.create_code(
        db,
        otc.PURPOSE_OAUTH_EXCHANGE,
        {
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "is_new_user": tokens.get("is_new_user", False),
        },
        otc.OAUTH_EXCHANGE_TTL_SECONDS,
    )
    logger.info("oauth_callback_google email=%s new=%s", email, tokens.get("is_new_user"))
    return RedirectResponse(url=f"{s.frontend_url}/auth/callback?code={exchange_code}")


# ── GitHub ────────────────────────────────────────────────────────────────────

@router.get("/auth/oauth/github")
def oauth_github(db: Session = Depends(get_db)):
    s = get_settings()
    if not s.github_client_id:
        raise AppError(code="OAUTH_NOT_CONFIGURED", message="GitHub OAuth is not configured.", status_code=501)
    redirect_uri = f"{s.app_base_url}/auth/callback/github"
    params = urlencode({
        "client_id": s.github_client_id,
        "redirect_uri": redirect_uri,
        "scope": "user:email",
        "state": otc.create_code(db, otc.PURPOSE_OAUTH_STATE, None, otc.OAUTH_STATE_TTL_SECONDS),
    })
    return RedirectResponse(url=f"https://github.com/login/oauth/authorize?{params}")


@router.get("/auth/callback/github")
def callback_github(
    code: str,
    state: str = "",
    service: AuthService = Depends(get_auth_service),
    db: Session = Depends(get_db),
):
    s = get_settings()
    if otc.consume_code(db, otc.PURPOSE_OAUTH_STATE, state) is None:
        logger.warning("oauth_state_invalid provider=github")
        return RedirectResponse(url=f"{s.frontend_url}/login?error=oauth_state_invalid")
    redirect_uri = f"{s.app_base_url}/auth/callback/github"

    try:
        token_resp = httpx.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": s.github_client_id,
                "client_secret": s.github_client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
            timeout=10,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise ValueError("No access token in GitHub response")
    except Exception as exc:
        logger.error("github_token_exchange_failed: %s", exc)
        return RedirectResponse(url=f"{s.frontend_url}/login?error=github_auth_failed")

    try:
        user_resp = httpx.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            timeout=10,
        )
        user_resp.raise_for_status()
        user_info = user_resp.json()
    except Exception as exc:
        logger.error("github_userinfo_failed: %s", exc)
        return RedirectResponse(url=f"{s.frontend_url}/login?error=github_auth_failed")

    email = user_info.get("email")
    if not email:
        try:
            emails_resp = httpx.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
                timeout=10,
            )
            emails_resp.raise_for_status()
            emails = emails_resp.json()
            email = next(
                (e["email"] for e in emails if e.get("primary") and e.get("verified")),
                None,
            )
        except Exception as exc:
            logger.error("github_emails_failed: %s", exc)

    if not email:
        return RedirectResponse(url=f"{s.frontend_url}/login?error=no_email")

    tokens = service.login_or_create_oauth_user(
        email=email,
        provider="github",
        provider_subject=str(user_info["id"]),
    )

    exchange_code = otc.create_code(
        db,
        otc.PURPOSE_OAUTH_EXCHANGE,
        {
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "is_new_user": tokens.get("is_new_user", False),
        },
        otc.OAUTH_EXCHANGE_TTL_SECONDS,
    )
    logger.info("oauth_callback_github email=%s new=%s", email, tokens.get("is_new_user"))
    return RedirectResponse(url=f"{s.frontend_url}/auth/callback?code={exchange_code}")


# ── Token exchange ─────────────────────────────────────────────────────────────

class OAuthExchangeRequest(BaseModel):
    code: str = Field(min_length=1)


@router.post("/auth/oauth/exchange")
def exchange_oauth_code(
    body: OAuthExchangeRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """Exchange a one-time OAuth code for JWT access + refresh tokens.

    The code is produced by the OAuth callback handler and is valid for 120 s.
    It is single-use: consuming it deletes it from the server-side store.
    The refresh token is also set as an httpOnly cookie; the JSON copy exists
    for clients where cross-site cookies are blocked (Safari ITP).
    """
    entry = otc.consume_code(db, otc.PURPOSE_OAUTH_EXCHANGE, body.code)
    if entry is None:
        raise AppError(
            code="INVALID_OR_EXPIRED_CODE",
            message="OAuth code is invalid or has expired. Please sign in again.",
            status_code=400,
        )

    set_refresh_cookie(response, entry["refresh_token"])
    return {
        "access_token": entry["access_token"],
        "token": entry["access_token"],
        "refresh_token": entry["refresh_token"],
        "token_type": "bearer",
        "is_new_user": entry.get("is_new_user", False),
    }
