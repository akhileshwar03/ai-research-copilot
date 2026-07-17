from sqlalchemy import Column, DateTime, Integer, String, Text

from app.db.session import Base


class OneTimeCode(Base):
    """Short-lived single-use codes, shared across all workers via the DB.

    Replaces the previous in-memory stores (OAuth exchange codes, OAuth CSRF
    states, deleted-account denylist), which silently broke the moment the app
    ran with more than one uvicorn worker or instance.

    purpose values:
      - "oauth_exchange": code handed to the frontend after an OAuth callback;
        payload holds the JWT pair (TTL 120 s, deleted on consume)
      - "oauth_state":    CSRF state for the OAuth authorization redirect
      - "deleted_account": denylist entry blocking auto-provision resurrection
    """

    __tablename__ = "one_time_codes"

    id = Column(Integer, primary_key=True)
    code_hash = Column(String, unique=True, nullable=False, index=True)
    purpose = Column(String, nullable=False, index=True)
    payload = Column(Text, nullable=True)  # JSON, purpose-specific
    expires_at = Column(DateTime(timezone=True), nullable=False)
