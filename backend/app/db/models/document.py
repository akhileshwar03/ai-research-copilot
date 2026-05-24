from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.db.session import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    original_filename = Column(String, nullable=False)
    stored_filename = Column(String, unique=True, nullable=False, index=True)
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    checksum_sha256 = Column(String, unique=True, nullable=False, index=True)
    upload_status = Column(String, nullable=False, default="ready")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
