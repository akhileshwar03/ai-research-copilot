"""Admin-only endpoints: overview stats, analytics, user and document
management, runtime settings, audit log, and system health.

All routes require a valid access token belonging to a user with
is_admin=True (enforced by the require_admin dependency). Admins are
bootstrapped via the ADMIN_EMAILS env var and can promote other users from
here. Every state-changing action is written to admin_audit_log.
"""

from fastapi import APIRouter

from app.api.routes.admin import audit, documents, overview, security, settings, system, users

router = APIRouter(prefix="/admin", tags=["admin"])
for module in (overview, users, documents, settings, audit, system, security):
    router.include_router(module.router)
