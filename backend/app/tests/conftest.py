"""Test configuration.

Tests run against a temporary in-memory SQLite database created fresh for the
test session. StaticPool ensures all SQLAlchemy connections share the same
underlying SQLite connection, which is required for in-memory databases where
each new connection would otherwise see an empty database.
"""

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Override DATABASE_URL *before* importing anything that reads settings.
# get_settings() uses lru_cache so the first call wins.
TEST_DB_URL = "sqlite:///:memory:"
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["ENVIRONMENT"] = "development"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-that-is-long-enough"
os.environ["OPENAI_API_KEY"] = "sk-test-placeholder"
os.environ["RATE_LIMIT_ENABLED"] = "false"

from app.db.session import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.api.dependencies import services as service_deps  # noqa: E402

# StaticPool: all connections share one in-memory SQLite database.
_test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
Base.metadata.create_all(bind=_test_engine)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)


def _override_get_db():
    """Yield a DB session backed by the test in-memory database."""
    db = TestingSessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ── Fakes ──────────────────────────────────────────────────────────────────────

class FakeChatService:
    async def stream_response(self, messages, document_ids=None, document_names=None, user_email=""):
        # Mirrors the real ChatService contract: a sources event first,
        # then token events.
        yield {"type": "sources", "sources": ["seed.pdf"]}
        for token in ["hello", " ", "world"]:
            yield {"type": "token", "value": token}


class FakeRealtimeService:
    async def stream_response(self, messages):
        yield {"type": "sources", "sources": [{"title": "Example", "url": "https://example.com"}]}
        for token in ["real", "-", "time"]:
            yield {"type": "token", "value": token}


class FakeDocumentService:
    def __init__(self):
        self.docs = [
            {"id": "seed.pdf", "name": "seed.pdf", "size_bytes": 1024,
             "upload_status": "ready", "created_at": None}
        ]

    async def initiate_upload(self, file, user_email=None):
        entry = {"document_id": "test.pdf", "name": getattr(file, "filename", "test.pdf"),
                 "upload_status": "processing", "size_bytes": 100}
        return entry

    def process_upload_background(self, stored_filename: str) -> None:
        pass

    def list_documents(self, user_email=None, skip=0, limit=100):
        return {"documents": list(self.docs), "total": len(self.docs), "skip": skip, "limit": limit}

    def get_document_status(self, stored_filename, user_email):
        return {"document_id": stored_filename, "upload_status": "ready", "error_message": None}

    def delete_document(self, filename, user_email=""):
        self.docs = [d for d in self.docs if d["id"] != filename]
        return {"message": "Document deleted"}


class FakeHumanizerService:
    def __init__(self):
        self.saved_runs: list[dict] = []
        self._next_id = 1

    def validate(self, text: str) -> str:
        stripped = text.strip()
        if not stripped:
            from app.core.exceptions import AppError
            raise AppError(code="EMPTY_TEXT", message="Text must not be empty", status_code=400)
        return stripped

    async def stream(self, text: str, style: str = "normal", expand: bool = False):
        for token in [f"[{style}]", " ", text]:
            yield {"type": "token", "text": token}

    def save_run(self, email: str, input_text: str, output_text: str, style: str) -> dict:
        from datetime import datetime, timezone

        run = {
            "id": self._next_id,
            "input_text": input_text,
            "output_text": output_text,
            "style": style,
            "created_at": datetime.now(timezone.utc),
        }
        self.saved_runs.append(run)
        self._next_id += 1
        return {"id": run["id"]}

    def list_runs(self, email: str, skip: int = 0, limit: int = 50) -> dict:
        return {"runs": self.saved_runs, "total": len(self.saved_runs), "skip": skip, "limit": limit}

    def delete_run(self, email: str, run_id: int) -> dict:
        self.saved_runs = [r for r in self.saved_runs if r["id"] != run_id]
        return {"id": run_id}


class FakeCheckerService:
    async def check_text(self, text: str, advanced: bool = False) -> dict:
        stripped = text.strip()
        if not stripped:
            from app.core.exceptions import AppError
            raise AppError(code="EMPTY_TEXT", message="Text must not be empty", status_code=400)
        return {
            "ai_probability": 0.42,
            "verdict": "uncertain",
            "confidence": "low",
            "signals": {
                "burstiness": 0.5,
                "lexical_diversity": 0.8,
                "ai_phrase_hits": 0,
                "heuristic_score": 42.0,
                "llm_probability": 0.42,
            },
            "explanation": "fake explanation",
            "disclaimer": "fake disclaimer",
        }


class FakeWritingFeedbackService:
    async def analyze(self, text: str) -> dict:
        stripped = text.strip()
        if not stripped:
            from app.core.exceptions import AppError
            raise AppError(code="EMPTY_TEXT", message="Text must not be empty", status_code=400)
        return {
            "issues": [
                {
                    "original": "fake issue span",
                    "suggestion": "fake fixed span",
                    "type": "style",
                    "explanation": "fake explanation",
                }
            ],
            "overall_score": 80,
            "summary": "fake summary",
            "word_count": len(stripped.split()),
        }


class FakeAIServiceForExtract:
    """Minimal stand-in for AIService used only by routes/extract.py's image
    endpoint — avoids a real network call to OpenAI during route tests."""

    async def describe_image(self, prompt: str, data_url: str) -> str:
        return "extracted text from fake vision call"


class FakePaperAnalyzerService:
    def analyze(self, pdf_bytes: bytes, style: str) -> dict:
        return {
            "style_guide": "APA (7th ed.)",
            "overall_score": 88.0,
            "page_count": 1,
            "checks": [
                {
                    "id": "margins",
                    "label": "Margins",
                    "status": "pass",
                    "score": 90.0,
                    "measured": "top 1.00\", bottom 1.00\", left 1.00\", right 1.00\"",
                    "expected": "top 1.00\", bottom 1.00\", left 1.00\", right 1.00\"",
                    "explanation": "fake explanation",
                }
            ],
            "disclaimer": "fake disclaimer",
        }


class FakeHealthService:
    def health(self):
        return {"status": "ok"}

    def readiness(self):
        return {
            "status": "ok",
            "checks": {
                "database": {"ok": True},
                "vector_store": {"ok": True},
                "openai": {"ok": True},
            },
        }


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def db_session():
    """Yield a DB session rolled back after each test for full isolation."""
    connection = _test_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client() -> TestClient:
    fake_document = FakeDocumentService()
    fake_humanizer = FakeHumanizerService()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[service_deps.get_chat_service] = lambda: FakeChatService()
    app.dependency_overrides[service_deps.get_document_service] = lambda: fake_document
    app.dependency_overrides[service_deps.get_health_service] = lambda: FakeHealthService()
    # Shared instance (not a fresh one per call) — history CRUD tests create a
    # run in one request and expect to see it in a later list/delete request.
    app.dependency_overrides[service_deps.get_humanizer_service] = lambda: fake_humanizer
    app.dependency_overrides[service_deps.get_checker_service] = lambda: FakeCheckerService()
    app.dependency_overrides[service_deps.get_writing_feedback_service] = lambda: FakeWritingFeedbackService()
    app.dependency_overrides[service_deps.get_ai_service] = lambda: FakeAIServiceForExtract()
    app.dependency_overrides[service_deps.get_realtime_service] = lambda: FakeRealtimeService()
    app.dependency_overrides[service_deps.get_paper_analyzer_service] = lambda: FakePaperAnalyzerService()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def unique_email() -> str:
    return f"user-{uuid.uuid4().hex[:12]}@example.com"


@pytest.fixture
def auth_headers(client, unique_email):
    """Register, log in, return Authorization headers for the test user."""
    client.post("/api/v1/register", json={"email": unique_email, "password": "StrongPass1"})
    resp = client.post("/api/v1/login", json={"email": unique_email, "password": "StrongPass1"})
    token = resp.json().get("access_token") or resp.json().get("token")
    return {"Authorization": f"bearer {token}"}
