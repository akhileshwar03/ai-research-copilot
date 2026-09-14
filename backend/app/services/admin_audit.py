"""Durable audit trail for admin actions (see AdminAuditLog)."""

import json
import logging

from sqlalchemy.orm import Session

from app.db.models.admin_audit_log import AdminAuditLog

logger = logging.getLogger(__name__)


def record_admin_action(
    db: Session,
    *,
    admin_email: str,
    action: str,
    target: str | None = None,
    details: dict | None = None,
) -> None:
    """Append one audit row and commit it. Also mirrors the entry to the
    process log so existing log-based alerting keeps working."""
    db.add(
        AdminAuditLog(
            admin_email=admin_email,
            action=action,
            target=target,
            details=json.dumps(details, default=str) if details else None,
        )
    )
    db.commit()
    logger.info("admin_action admin=%s action=%s target=%s details=%s", admin_email, action, target, details)
