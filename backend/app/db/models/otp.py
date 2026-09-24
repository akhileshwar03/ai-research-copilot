from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.db.session import Base


class OtpToken(Base):
    __tablename__ = "otp_tokens"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, index=True)
    # sha256 of the 6-digit code (app.core.security.hash_token) -- never the
    # raw code itself. The plaintext only ever exists in memory for the
    # single request that emails it; see OtpRepository.create().
    code_hash = Column(String, nullable=False)
    purpose = Column(String, nullable=False, default="auth")  # auth | verify
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
