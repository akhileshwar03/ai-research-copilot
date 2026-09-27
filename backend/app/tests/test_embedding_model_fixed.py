"""EmbeddingService uses exactly one fixed model, always -- no runtime setting, no admin toggle.

Replaces the old test_embedding_model_switch.py: that runtime switch was removed on 2026-09-27 (a real
incident showed a live toggle without a re-embed step first is a footgun; the user asked for one single,
non-configurable model instead). Changing the model now means editing EMBEDDING_MODEL in
app/modules/rag/embedding_service.py and redeploying -- a deliberate code change, not a runtime flip.
"""

from unittest.mock import patch

from app.modules.rag.embedding_service import EMBEDDING_MODEL, EmbeddingService


def _fake_openai_embeddings():
    class _Fake:
        def __init__(self, model, api_key):
            self.model = model
            self.client = object()

        def embed_query(self, text):
            return [self.model]

        def embed_documents(self, texts):
            return [[self.model] for _ in texts]

    return _Fake


def test_the_model_is_the_one_fixed_constant():
    assert EMBEDDING_MODEL == "text-embedding-3-small"


def test_embed_query_always_uses_the_fixed_model():
    with patch("app.modules.rag.embedding_service.OpenAIEmbeddings", _fake_openai_embeddings()):
        service = EmbeddingService()
        assert service.embed_query("x") == [EMBEDDING_MODEL]


def test_embed_documents_always_uses_the_fixed_model():
    with patch("app.modules.rag.embedding_service.OpenAIEmbeddings", _fake_openai_embeddings()):
        service = EmbeddingService()
        assert service.embed_documents(["a", "b"]) == [[EMBEDDING_MODEL], [EMBEDDING_MODEL]]


def test_no_runtime_setting_controls_it_anymore():
    from app.services.runtime_settings import _defs

    assert "rag_embedding_model" not in _defs()
