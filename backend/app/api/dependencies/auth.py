import logging

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.core.security import decode_access_token
from app.db.repositories.user_repository import UserRepository
from app.db.session import get_db

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


def get_current_user_email(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> str:
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

    return email
