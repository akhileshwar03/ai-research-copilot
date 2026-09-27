"""Regression tests for three Research Copilot correctness bugs found in the 2026-09 audit.

1. Follow-up questions ("And what about MUG?") retrieved by embedding only the latest message, so they
   returned unrelated chunks.
2. Whole-document mode spent one running character budget in source order, so a long first document
   silently dropped every later document, and any long document lost its ending (references/conclusions).
3. A database failure inside the vector store was swallowed and returned as "no chunks", which the chat
   layer then told the user as "the document does not contain the answer".

12 of these tests fail against the pre-fix code (verified by restoring it); the other 9 are guards pinning
behaviour that must not change (first questions are not rewritten, structured modes spend no rewrite call,
max_pages stays best-effort, nothing is cut under the cap).
"""

import asyncio
import json

import pytest

from app.api.dependencies.services import get_chat_service
from app.core.exceptions import AppError
from app.modules.rag.pgvector_store import PgVectorStore
from app.modules.rag.retrieval_service import RetrievalService
from app.services.chat_service import ChatService


def _run(agen):
    async def collect():
        return [item async for item in agen]

    return asyncio.run(collect())


# ── Bug 3: a failed read must be an error, never an empty result ─────────────────────────────────────────
class _ExplodingSession:
    def execute(self, *args, **kwargs):
        raise RuntimeError("connection reset by peer")

    def close(self):
        pass


@pytest.fixture
def broken_db(monkeypatch):
    import app.db.session as db_session_module

    monkeypatch.setattr(db_session_module, "SessionLocal", lambda: _ExplodingSession())


@pytest.mark.parametrize(
    "call",
    [
        lambda s: s.query([0.1], 6, {"user_email": "u@example.com"}),
        lambda s: s.get_all_chunks(["doc.pdf"], user_email="u@example.com"),
        lambda s: s.get_chunks_by_pages(["doc.pdf"], [3], user_email="u@example.com"),
    ],
    ids=["query", "get_all_chunks", "get_chunks_by_pages"],
)
def test_vector_store_read_failure_raises_instead_of_returning_empty(broken_db, call):
    with pytest.raises(AppError) as exc_info:
        call(PgVectorStore())
    assert exc_info.value.code == "RETRIEVAL_UNAVAILABLE"
    assert exc_info.value.status_code == 503


def test_max_pages_stays_best_effort_on_failure(broken_db):
    # It only feeds an optional page-count hint, so an outage there must not fail a whole chat turn.
    assert PgVectorStore().max_pages(["doc.pdf"], user_email="u@example.com") == {}


def test_chat_route_sends_the_real_reason_when_retrieval_is_unavailable(client, auth_headers):
    from app.main import app

    class _DownService:
        def validate_latest_message(self, messages):
            pass

        def validate_action(self, action, document_ids):
            pass

        async def decide_full_document(self, messages, action, document_ids):
            return False

        async def stream_response(self, **kwargs):
            raise AppError(code="RETRIEVAL_UNAVAILABLE", message="Document search is temporarily unavailable.", status_code=503)
            yield  # pragma: no cover  (makes this an async generator)

    previous = app.dependency_overrides.get(get_chat_service)
    app.dependency_overrides[get_chat_service] = lambda: _DownService()
    try:
        resp = client.post(
            "/api/v1/chat", json={"messages": [{"role": "user", "content": "hi"}], "document_ids": None}, headers=auth_headers
        )
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_chat_service, None)
        else:
            app.dependency_overrides[get_chat_service] = previous

    error_frames = [f for f in resp.text.split("\n\n") if f.startswith("event: error")]
    assert len(error_frames) == 1
    assert json.loads(error_frames[0].split("data: ", 1)[1])["message"] == "Document search is temporarily unavailable."
    assert "event: done" in resp.text


# ── Bug 2: fair per-document budgets, head + tail kept ───────────────────────────────────────────────────
class _FakeStore:
    def __init__(self, chunks):
        self._chunks = chunks

    def get_all_chunks(self, source_ids, user_email=""):
        return self._chunks


class _NoEmbeddings:
    def embed_query(self, query):
        return [0.0]


def _doc(source: str, n_pages: int, body_len: int = 200, last_text: str | None = None) -> list[dict]:
    chunks = [
        {"source": source, "page": p, "chunk": p, "content": f"{source}-p{p} " + "x" * body_len} for p in range(1, n_pages + 1)
    ]
    if last_text:
        chunks[-1]["content"] = last_text
    return chunks


def _service(chunks) -> RetrievalService:
    return RetrievalService(embedding_service=_NoEmbeddings(), vector_store=_FakeStore(chunks))


def test_a_long_first_document_no_longer_starves_the_second():
    # Old behaviour: doc "a" alone exceeds the cap, the loop breaks, doc "b" contributes nothing at all.
    chunks = _doc("a", 40) + _doc("b", 40)
    result = _service(chunks).get_full_document_context(["a", "b"], max_chars=6000)

    assert "[SOURCE: a" in result["context"]
    assert "[SOURCE: b" in result["context"]
    assert sorted(result["truncated_sources"]) == ["a", "b"]
    assert len(result["context"]) <= 6000


def test_a_short_document_is_kept_whole_and_its_unused_share_goes_to_the_long_one():
    short = _doc("short", 2)
    long_ = _doc("long", 60)
    result = _service(long_ + short).get_full_document_context(["long", "short"], max_chars=8000)

    assert result["truncated_sources"] == ["long"]
    assert "short-p1" in result["context"] and "short-p2" in result["context"]
    # The long one used more than an equal split (4000) because the short one left budget unused.
    long_chars = sum(len(p) for p in result["context"].split("\n\n") if p.startswith("[SOURCE: long"))
    assert long_chars > 4000
    assert len(result["context"]) <= 8000


def test_a_truncated_document_keeps_its_ending_not_just_its_beginning():
    chunks = _doc("paper", 50, last_text="REFERENCES [1] Vaswani et al. Attention is all you need")
    result = _service(chunks).get_full_document_context(["paper"], max_chars=4000)

    assert result["truncated"] is True
    assert "paper-p1 " in result["context"]  # beginning kept
    assert "REFERENCES [1] Vaswani" in result["context"]  # ending kept -- the old head-only cut lost this
    assert "middle of this document omitted" in result["context"]
    assert len(result["context"]) <= 4000


def test_under_the_cap_nothing_is_cut_and_selection_order_is_respected():
    chunks = _doc("a", 2) + _doc("b", 2)  # source order in the DB is a, b
    result = _service(chunks).get_full_document_context(["b", "a"], max_chars=100_000)

    assert result["truncated"] is False
    assert result["truncated_sources"] == []
    assert result["chunk_count"] == 4
    assert result["context"].index("b-p1") < result["context"].index("a-p1")  # the user's order, not the DB's


def test_truncation_label_names_the_documents_that_were_cut():
    class _Retrieval:
        def get_max_indexed_pages(self, *a, **k):
            return {}

        def get_full_document_context(self, source_ids, **k):
            return {"context": "[SOURCE: Big.pdf]\nx", "truncated": True, "chunk_count": 3, "truncated_sources": ["big.pdf"]}

    class _AI:
        last = None

        async def stream_chat(self, messages):
            _AI.last = messages
            yield "ok"

    _run(
        ChatService(_Retrieval(), _AI()).stream_response(
            messages=[{"role": "user", "content": "list all the sections"}],
            document_ids=["big.pdf"],
            document_names={"big.pdf": "Big.pdf"},
            user_email="u@example.com",
        )
    )
    system = _AI.last[0][1]
    assert "not guaranteed exact" in system
    assert "keeping only their beginning and end: Big.pdf" in system


# ── Bug 1: follow-ups are rewritten into standalone queries ──────────────────────────────────────────────
class _Retrieval:
    def __init__(self):
        self.queries: list[str] = []
        self.full_document_called = False
        self.page_called = False

    async def retrieve_context(self, query, source_ids=None, n_results=None, user_email="", source_names=None):
        self.queries.append(query)
        return {"context": "[SOURCE: Doc]\nsome text", "sources": ["doc.pdf"]}

    def get_max_indexed_pages(self, *a, **k):
        return {}

    def get_full_document_context(self, *a, **k):
        self.full_document_called = True
        return {"context": "[SOURCE: Doc]\nfull", "truncated": False, "chunk_count": 1, "truncated_sources": []}

    def get_page_context(self, source_ids, pages, **k):
        self.page_called = True
        return {"context": "[SOURCE: Doc | PAGE: 4]\np", "chunk_count": 1, "found_pages": pages, "missing_pages": []}


class _AI:
    def __init__(self, condense_result="MUG database accuracy facial expression paper", raises=False):
        self.condense_calls: list[list] = []
        self._result = condense_result
        self._raises = raises

    async def condense_query(self, messages):
        self.condense_calls.append(messages)
        if self._raises:
            raise RuntimeError("model unavailable")
        return self._result

    async def stream_chat(self, messages):
        yield "ok"


_HISTORY = [
    {"role": "user", "content": "What accuracy did the facial expression paper get on CK+?"},
    {"role": "assistant", "content": "It achieved 99.33% on CK+."},
]


def _chat(retrieval, ai, messages, **kwargs):
    kwargs.setdefault("document_ids", ["doc.pdf"])
    kwargs.setdefault("document_names", {"doc.pdf": "Doc"})
    return _run(ChatService(retrieval, ai).stream_response(messages=messages, user_email="u@example.com", **kwargs))


def test_a_follow_up_is_searched_by_its_rewritten_standalone_query():
    retrieval, ai = _Retrieval(), _AI()
    _chat(retrieval, ai, _HISTORY + [{"role": "user", "content": "And what about MUG?"}])

    assert retrieval.queries == ["MUG database accuracy facial expression paper"]
    prompt = ai.condense_calls[0][1][1]
    assert "99.33% on CK+" in prompt and "Latest question: And what about MUG?" in prompt


def test_a_first_question_is_searched_as_typed_with_no_extra_model_call():
    retrieval, ai = _Retrieval(), _AI()
    _chat(retrieval, ai, [{"role": "user", "content": "What is the input size?"}])

    assert retrieval.queries == ["What is the input size?"]
    assert ai.condense_calls == []


def test_the_rewrite_uses_only_the_last_few_messages_truncated():
    retrieval, ai = _Retrieval(), _AI()
    long_history = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"m{i} " + "y" * 2000} for i in range(10)]
    _chat(retrieval, ai, long_history + [{"role": "user", "content": "and then?"}])

    prompt = ai.condense_calls[0][1][1]
    assert "m9 " in prompt and "m6 " in prompt  # last 4 history messages
    assert "m5 " not in prompt  # older ones dropped
    assert len(prompt) < 4 * 700  # each message cut to 600 chars


@pytest.mark.parametrize("bad", ["", "   ", "x" * 501])
def test_unusable_rewrite_output_falls_back_to_the_users_words(bad):
    retrieval = _Retrieval()
    _chat(retrieval, _AI(condense_result=bad), _HISTORY + [{"role": "user", "content": "And what about MUG?"}])
    assert retrieval.queries == ["And what about MUG?"]


def test_a_failing_rewrite_never_fails_the_reply():
    retrieval = _Retrieval()
    events = _chat(retrieval, _AI(raises=True), _HISTORY + [{"role": "user", "content": "And what about MUG?"}])
    assert retrieval.queries == ["And what about MUG?"]
    assert {"type": "token", "value": "ok"} in events


def test_surrounding_quotes_are_stripped_from_the_rewrite():
    retrieval = _Retrieval()
    _chat(retrieval, _AI(condense_result='"MUG accuracy"'), _HISTORY + [{"role": "user", "content": "and MUG?"}])
    assert retrieval.queries == ["MUG accuracy"]


@pytest.mark.parametrize(
    "message,action,expect",
    [
        ("how many questions are there?", None, "full"),  # aggregate path
        ("what is on page 4?", None, "page"),  # exact page path
        ("Summarize", "summarize", "full"),  # research action
    ],
)
def test_structured_modes_do_not_spend_a_rewrite_call(message, action, expect):
    retrieval, ai = _Retrieval(), _AI()
    _chat(retrieval, ai, _HISTORY + [{"role": "user", "content": message}], action=action)

    assert ai.condense_calls == []
    assert retrieval.queries == []
    assert (retrieval.full_document_called if expect == "full" else retrieval.page_called) is True
