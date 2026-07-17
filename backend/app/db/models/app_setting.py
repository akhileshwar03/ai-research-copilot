from sqlalchemy import Column, DateTime, String, func

from app.db.session import Base


class AppSetting(Base):
    """Admin-adjustable runtime settings stored as key/value strings.

    Values here override the environment-derived defaults in Settings, so an
    admin can change limits (upload size, rate limits, RAG parameters) without
    a redeploy. Typing/validation lives in app.services.runtime_settings.
    """

    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
