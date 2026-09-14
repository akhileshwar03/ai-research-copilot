from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.db.session import Base


class AdminAuditLog(Base):
    """Append-only record of every state-changing admin action.

    Previously admin actions were only ever written to the process log, which
    on a free-tier host is gone after the next redeploy. This table is what
    the admin panel's "Audit log" tab reads, so "who suspended this user and
    when" has a durable answer."""

    __tablename__ = "admin_audit_log"

    id = Column(Integer, primary_key=True, index=True)
    admin_email = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False, index=True)
    # Human-readable identifier of what was acted on (an email, a document
    # name, a setting key) — a string on purpose so the row still reads
    # correctly after the target itself has been deleted.
    target = Column(String, nullable=True)
    # JSON-encoded extra context (the fields changed, the values set, ...).
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
