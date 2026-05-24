import os
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("AUTO_CREATE_TABLES", "true")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("DATABASE_URL", "sqlite:///./app.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")

from app.main import app  # noqa: E402
from app.api.dependencies import services as service_deps  # noqa: E402


class FakeChatService:
    async def stream_response(self, messages, document_id=None):
        for token in ["hello", " ", "world"]:
            yield token


class FakeDocumentService:
    def __init__(self):
        self.docs = ["seed.pdf"]

    async def upload(self, file):
        return {"message": "PDF uploaded successfully"}

    def list_documents(self):
        return {"documents": list(self.docs)}

    def delete_document(self, filename):
        if filename in self.docs:
            self.docs.remove(filename)
            return {"message": "Document deleted"}
        return {"message": "Document not found"}


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


@pytest.fixture
def client() -> Iterator[TestClient]:
    fake_document = FakeDocumentService()

    app.dependency_overrides[service_deps.get_chat_service] = lambda: FakeChatService()
    app.dependency_overrides[service_deps.get_document_service] = lambda: fake_document
    app.dependency_overrides[service_deps.get_health_service] = lambda: FakeHealthService()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def unique_email() -> str:
    return f"user-{uuid.uuid4().hex[:12]}@example.com"
