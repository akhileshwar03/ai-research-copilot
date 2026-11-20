import logging

from sqlalchemy import text

from app.db.session import SessionLocal
from app.services.ai_service import AIService
from app.services.checker_service import checker_configured, ping_checker

logger = logging.getLogger(__name__)


class HealthService:
    def __init__(self, vector_store, ai_service: AIService):
        self.vector_store = vector_store
        self.ai_service = ai_service

    @staticmethod
    def _failed(exc: Exception) -> dict:
        # /readiness is public. Exception text can carry the database host and user, or the start of
        # an API key ("Incorrect API key provided: sk-proj-..."), so it goes to the server log only.
        logger.warning("readiness_check_failed error=%s", type(exc).__name__, exc_info=exc)
        return {"ok": False}

    def health(self) -> dict:
        return {"status": "ok"}

    def readiness(self) -> dict:
        checks = {
            "database": self._check_database(),
            "vector_store": self._check_vector_store(),
            "openai": self._check_openai(),
            "checker": self._check_checker(),
        }
        status = "ok" if all(item["ok"] for item in checks.values()) else "degraded"
        return {"status": status, "checks": checks}

    def _check_database(self) -> dict:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            return {"ok": True}
        except Exception as exc:
            return self._failed(exc)
        finally:
            db.close()

    def _check_vector_store(self) -> dict:
        try:
            self.vector_store.ping()
            return {"ok": True}
        except Exception as exc:
            return self._failed(exc)

    def _check_openai(self) -> dict:
        try:
            return {"ok": self.ai_service.ping()}
        except Exception as exc:
            return self._failed(exc)

    def _check_checker(self) -> dict:
        # The AI Checker is the single most-used tool in this app (see admin Overview), and it runs
        # entirely on an external machine (Mac Studio) reached through a Cloudflare tunnel -- a real
        # single point of failure with no code-level failover. Before this, /readiness never checked
        # it at all, so that machine or tunnel going down would show as fully "ok" here while the
        # app's busiest feature silently failed for every user until someone noticed by hand.
        # "Not configured" (expected in dev/test, where the checker is deliberately not set up) is
        # reported as healthy -- only "configured but unreachable" (a real outage) degrades readiness.
        if not checker_configured():
            return {"ok": True, "configured": False}
        try:
            return {"ok": ping_checker(), "configured": True}
        except Exception as exc:
            return self._failed(exc) | {"configured": True}
