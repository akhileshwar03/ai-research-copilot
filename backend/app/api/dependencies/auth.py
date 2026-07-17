import logging

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.services.one_time_code_store import is_account_denied
from app.core.security import decode_access_token
from app.db.models.user import User
from app.db.repositories.user_repository import UserRepository
from app.db.session import get_db

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise AppError(code="AUTH_HEADER_MISSING", message="Missing authorization header", status_code=401)

    try:
        payload = decode_access_token(credentials.credentials)
    except ValueError:
        raise AppError(code="INVALID_TOKEN", message="Invalid or expired access token", status_code=401)

    email = payload.get("sub")
    if not email:
        raise AppError(code="INVALID_TOKEN_SUBJECT", message="Invalid token subject", status_code=401)

    user_repo = UserRepository(db)
    user = user_repo.get_by_email(email)
    if not user:
        # Deleted accounts must stay deleted: a still-valid access token would
        # otherwise resurrect the account via the auto-provision path below.
        if is_account_denied(db, email):
            raise AppError(code="ACCOUNT_DELETED", message="This account has been deleted", status_code=401)

        # JWT signature is valid but the user row doesn't exist.
        # This happens when the database is reset (e.g. Render redeploy on ephemeral
        # SQLite) while the client still holds a valid access token.
        # Auto-provision the user so existing sessions continue to work seamlessly.
        user = user_repo.create(email=email, hashed_password=None, email_verified=True)
        user_repo.create_identity(
            user_id=user.id,
            provider="jwt",
            provider_subject=email,
            email=email,
        )
        db.commit()
        logger.info("user_auto_provisioned email=%s", email)

    if not user.is_active:
        raise AppError(
            code="ACCOUNT_SUSPENDED",
            message="This account has been suspended. Contact support.",
            status_code=403,
        )

    # ADMIN_EMAILS bootstrap: promote on every request so the flag survives
    # ephemeral-DB resets without a manual step.
    if not user.is_admin and email.lower() in get_settings().admin_email_list:
        user.is_admin = True
        db.commit()
        logger.info("admin_bootstrapped email=%s", email)

    return user


def get_current_user_email(user: User = Depends(get_current_user)) -> str:
    return user.email


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency for admin-only endpoints. 403 for non-admin users."""
    if not user.is_admin:
        raise AppError(code="ADMIN_REQUIRED", message="Admin privileges required", status_code=403)
    return user
