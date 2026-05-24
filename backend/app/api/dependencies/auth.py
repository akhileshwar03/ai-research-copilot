from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.core.security import decode_access_token
from app.db.repositories.user_repository import UserRepository
from app.db.session import get_db

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

    user = UserRepository(db).get_by_email(email)
    if not user:
        raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=401)
    return email
