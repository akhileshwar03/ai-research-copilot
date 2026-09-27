"""EmbeddingService reads the model from the admin-adjustable rag_embedding_model runtime setting on every
call, not once at construction — an admin can switch models (after running scripts/reembed_chunks.py) without
a redeploy. A client is built once per model name and reused."""

from unittest.mock import patch

import pytest

from app.modules.rag.embedding_service import EmbeddingService
from app.services.runtime_settings import runtime_settings


@pytest.fixture
def setting(monkeypatch):
    overrides: dict = {}
    real_get = runtime_settings.get
    monkeypatch.setattr(runtime_settings, "get", lambda key: overrides[key] if key in overrides else real_get(key))
    return overrides.__setitem__


def _fake_openai_embeddings():
    """A stand-in for langchain_openai.OpenAIEmbeddings that records the model it was built with and returns
    a value derived from the model name, so a test can tell which client actually answered."""

    class _Fake:
        def __init__(self, model, api_key):
            self.model = model
            self.client = object()  # _MeteredEmbeddingsClient just needs something to wrap

        def embed_query(self, text):
            return [self.model]

        def embed_documents(self, texts):
            return [[self.model] for _ in texts]

    return _Fake


def test_defaults_to_the_setting_currently_configured(setting):
    setting("rag_embedding_model", "text-embedding-ada-002")
    with patch("app.modules.rag.embedding_service.OpenAIEmbeddings", _fake_openai_embeddings()):
        service = EmbeddingService()
        assert service.embed_query("x") == ["text-embedding-ada-002"]


def test_switching_the_setting_switches_the_model_with_no_new_service_instance(setting):
    setting("rag_embedding_model", "text-embedding-ada-002")
    with patch("app.modules.rag.embedding_service.OpenAIEmbeddings", _fake_openai_embeddings()):
        service = EmbeddingService()
        before = service.embed_query("x")
        setting("rag_embedding_model", "text-embedding-3-small")
        after = service.embed_query("x")

    assert before == ["text-embedding-ada-002"]
    assert after == ["text-embedding-3-small"]
    assert before != after


def test_a_client_is_built_once_per_model_and_reused(setting):
    calls = []
    fake_cls = _fake_openai_embeddings()

    def counting_fake(model, api_key):
        calls.append(model)
        return fake_cls(model, api_key)

    setting("rag_embedding_model", "text-embedding-ada-002")
    with patch("app.modules.rag.embedding_service.OpenAIEmbeddings", counting_fake):
        service = EmbeddingService()
        service.embed_query("a")
        service.embed_query("b")
        setting("rag_embedding_model", "text-embedding-3-small")
        service.embed_query("c")
        setting("rag_embedding_model", "text-embedding-ada-002")  # switch back
        service.embed_query("d")

    assert calls == ["text-embedding-ada-002", "text-embedding-3-small"]  # never rebuilt for a model seen before


def test_embed_documents_also_follows_the_current_setting(setting):
    setting("rag_embedding_model", "text-embedding-3-small")
    with patch("app.modules.rag.embedding_service.OpenAIEmbeddings", _fake_openai_embeddings()):
        service = EmbeddingService()
        vectors = service.embed_documents(["a", "b", "c"])

    assert vectors == [["text-embedding-3-small"]] * 3
