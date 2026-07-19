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

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[service_deps.get_chat_service] = lambda: FakeChatService()
    app.dependency_overrides[service_deps.get_document_service] = lambda: fake_document
    app.dependency_overrides[service_deps.get_health_service] = lambda: FakeHealthService()

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
