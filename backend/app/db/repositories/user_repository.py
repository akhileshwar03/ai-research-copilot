from sqlalchemy.orm import Session

from app.db.models.user import RefreshToken, User, UserIdentity


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> User | None:
        return self.db.query(User).filter(User.email == email).first()

    def get_by_id(self, user_id: int) -> User | None:
        return self.db.query(User).filter(User.id == user_id).first()

    def create(self, email: str, hashed_password: str | None) -> User:
        user = User(email=email, hashed_password=hashed_password)
        self.db.add(user)
        self.db.flush()
        return user

    def create_identity(self, user_id: int, provider: str, provider_subject: str, email: str | None = None) -> UserIdentity:
        identity = UserIdentity(
            user_id=user_id,
            provider=provider,
            provider_subject=provider_subject,
            email=email,
        )
        self.db.add(identity)
        self.db.flush()
        return identity

    def get_identity(self, provider: str, provider_subject: str) -> UserIdentity | None:
        return (
            self.db.query(UserIdentity)
            .filter(UserIdentity.provider == provider, UserIdentity.provider_subject == provider_subject)
            .first()
        )

    def create_refresh_token(self, user_id: int, token_hash: str, expires_at) -> RefreshToken:
        refresh = RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        self.db.add(refresh)
        self.db.flush()
        return refresh

    def get_refresh_token(self, token_hash: str) -> RefreshToken | None:
        return self.db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

    def revoke_refresh_token(self, refresh_token: RefreshToken) -> None:
        refresh_token.revoked = True
        self.db.flush()
