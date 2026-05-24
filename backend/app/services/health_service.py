from sqlalchemy import text

from app.db.session import SessionLocal
from app.modules.rag.vector_store_manager import VectorStoreManager
from app.services.ai_service import AIService


class HealthService:
    def __init__(self, vector_store: VectorStoreManager, ai_service: AIService):
        self.vector_store = vector_store
        self.ai_service = ai_service

    def health(self) -> dict:
        return {"status": "ok"}

    def readiness(self) -> dict:
        checks = {
            "database": self._check_database(),
            "vector_store": self._check_vector_store(),
            "openai": self._check_openai(),
        }
        status = "ok" if all(item["ok"] for item in checks.values()) else "degraded"
        return {"status": status, "checks": checks}

    def _check_database(self) -> dict:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            return {"ok": True}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        finally:
            db.close()

    def _check_vector_store(self) -> dict:
        try:
            self.vector_store.ping()
            return {"ok": True}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def _check_openai(self) -> dict:
        try:
            return {"ok": self.ai_service.ping()}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
