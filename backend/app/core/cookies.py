"""Refresh-token cookie handling.

The refresh token is delivered as an httpOnly cookie so XSS cannot exfiltrate
it (localStorage was readable by any injected script). The access token stays
in JS-land — it is short-lived by design.

Cookie attributes depend on the deployment shape:
- development (localhost:3000 → localhost:8000): same-site across ports, so
  SameSite=Lax without Secure works.
- production (vercel.app → onrender.com): cross-site, which requires
  SameSite=None; Secure. Note Safari's ITP blocks third-party cookies, so
  Safari users fall back to the request-body refresh token path.
"""

from fastapi import Request, Response

from app.core.config import get_settings

REFRESH_COOKIE_NAME = "refresh_token"


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    settings = get_settings()
    dev = settings.is_development
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        httponly=True,
        secure=not dev,
        samesite="lax" if dev else "none",
        path="/",
    )


def clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    dev = settings.is_development
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        httponly=True,
        secure=not dev,
        samesite="lax" if dev else "none",
        path="/",
    )


def get_refresh_cookie(request: Request) -> str | None:
    return request.cookies.get(REFRESH_COOKIE_NAME)
