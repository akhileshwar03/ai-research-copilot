"""Cost guards for the Research Copilot: history trimming and the daily whole-document allowance.

A whole-document request (research action, or a "how many / list all" question) sends tens of thousands of
tokens to the model -- roughly 15x a normal question -- and every chat turn used to resend the entire
conversation. Both are what a free user can inflate, so both are bounded here.
"""

import asyncio
import uuid
from datetime import date, timedelta

import pytest

from app.api.dependencies import services as service_deps
from app.core.exceptions import AppError
from app.db.models.chat_quota import ChatQuotaUsage
from app.db.models.user import User
from app.services import chat_quota
from app.services.chat_service import ROUTE_PROMPT, ChatService, _trim_history
from app.services.runtime_settings import runtime_settings
from app.tests.conftest import TestingSessionLocal


def _run(agen):
    async def collect():
        return [item async for item in agen]

    return asyncio.run(collect())


@pytest.fixture
def setting(monkeypatch):
    """Override runtime settings for one test: setting("chat_history_max_chars", 1000)."""
    overrides: dict = {}
    real_get = runtime_settings.get
    monkeypatch.setattr(runtime_settings, "get", lambda key: overrides[key] if key in overrides else real_get(key))
    return overrides.__setitem__


# ── history trimming ─────────────────────────────────────────────────────────────────────────────────────
def _msgs(*sizes_and_roles):
    # Distinct content per message, so membership checks can tell them apart.
    return [{"role": role, "content": f"{i}:" + "x" * (size - 2)} for i, (role, size) in enumerate(sizes_and_roles)]


def test_history_under_the_budget_is_untouched():
    history = _msgs(("user", 100), ("assistant", 200), ("user", 50))
    assert _trim_history(history, 10_000) == history


def test_oldest_messages_are_dropped_first():
    history = _msgs(("user", 400), ("assistant", 400), ("user", 400), ("assistant", 400), ("user", 100))
    kept = _trim_history(history, 1000)
    assert kept[-1] is history[-1]  # the newest message is always kept
    assert history[0] not in kept and history[1] not in kept
    assert sum(len(m["content"]) for m in kept) <= 1000


def test_the_newest_message_is_kept_even_if_it_alone_exceeds_the_budget():
    history = _msgs(("user", 100), ("assistant", 100), ("user", 5000))
    assert _trim_history(history, 1000) == [history[-1]]


def test_the_window_never_starts_on_an_orphaned_assistant_reply():
    history = _msgs(("user", 900), ("assistant", 300), ("user", 300))
    kept = _trim_history(history, 700)  # would keep [assistant, user]; the assistant's question is cut
    assert [m["role"] for m in kept] == ["user"]


class _AI:
    def __init__(self):
        self.last_messages = None

    async def stream_chat(self, messages):
        self.last_messages = messages
        yield "ok"

    async def condense_query(self, messages):
        return "standalone query"


class _Retrieval:
    def __init__(self):
        self.full_document_called = False
        self.page_called = False
        self.retrieve_called = False

    async def retrieve_context(self, query, **k):
        self.retrieve_called = True
        return {"context": "[SOURCE: Doc]\ntext", "sources": ["d.pdf"]}

    def get_max_indexed_pages(self, *a, **k):
        return {}

    def get_full_document_context(self, *a, **k):
        self.full_document_called = True
        return {"context": "[SOURCE: Doc]\nfull", "truncated": False, "chunk_count": 1, "truncated_sources": []}

    def get_page_context(self, source_ids, pages, **k):
        self.page_called = True
        return {"context": "[SOURCE: Doc | PAGE: 1]\np", "chunk_count": 1, "found_pages": pages, "missing_pages": []}


def _long_conversation():
    turns = []
    for i in range(10):
        turns.append({"role": "user", "content": f"question {i} " + "q" * 500})
        turns.append({"role": "assistant", "content": f"answer {i} " + "a" * 500})
    return turns + [{"role": "user", "content": "the latest question"}]


def test_a_long_conversation_sends_only_recent_turns_to_the_model(setting):
    setting("chat_history_max_chars", 3000)
    ai = _AI()
    _run(
        ChatService(_Retrieval(), ai).stream_response(
            messages=_long_conversation(), document_ids=["d.pdf"], document_names={"d.pdf": "Doc"}, user_email="u@x.com"
        )
    )
    sent = ai.last_messages[1:]  # [0] is the system prompt
    assert sent[-1] == ("user", "the latest question")
    assert 0 < len(sent) < 21
    assert sum(len(content) for _role, content in sent) <= 3000 + len("the latest question")
    assert sent[0][0] == "user"


def test_the_no_document_path_is_trimmed_too(setting):
    setting("chat_history_max_chars", 2000)
    ai = _AI()
    _run(ChatService(_Retrieval(), ai).stream_response(messages=_long_conversation(), document_ids=None))
    assert len(ai.last_messages) - 1 < 21


def test_the_follow_up_rewrite_still_sees_recent_history_after_trimming_was_added(setting):
    setting("chat_history_max_chars", 2000)
    seen = {}

    class _AIRecording(_AI):
        async def condense_query(self, messages):
            seen["prompt"] = messages[1][1]
            return "rewritten"

    _run(
        ChatService(_Retrieval(), _AIRecording()).stream_response(
            messages=_long_conversation(), document_ids=["d.pdf"], document_names={"d.pdf": "Doc"}, user_email="u@x.com"
        )
    )
    assert "answer 9" in seen["prompt"]


# ── routing: which requests take the (expensive) whole-document path ────────────────────────────────────
class _RouterAI(_AI):
    """Stands in for the classifier model: answers WHOLE / LOOKUP, or fails."""

    def __init__(self, verdict="LOOKUP", raises=False):
        super().__init__()
        self.calls: list = []
        self._verdict, self._raises = verdict, raises

    async def classify(self, messages):
        if messages[0][1] != ROUTE_PROMPT:  # e.g. the follow-up-suggestions call, which also uses classify()
            return "[]"
        self.calls.append(messages)
        if self._raises:
            raise RuntimeError("model unavailable")
        return self._verdict


@pytest.fixture(autouse=True)
def _fresh_route_cache():
    from app.services import chat_service

    chat_service._route_cache.clear()
    yield
    chat_service._route_cache.clear()


def _decide(ai, message, action=None, docs=("d.pdf",)):
    msgs = [{"role": "user", "content": message}]
    return asyncio.run(ChatService(_Retrieval(), ai).decide_full_document(msgs, action, list(docs) if docs else None))


def test_actions_are_whole_document_without_asking_the_classifier():
    ai = _RouterAI()
    assert _decide(ai, "Summarize", action="summarize") is True
    assert ai.calls == []


def test_no_documents_selected_means_nothing_to_send():
    assert _decide(_RouterAI("WHOLE"), "how many questions does it have?", docs=None) is False


def test_a_page_question_is_never_whole_document_even_with_a_count_word():
    ai = _RouterAI("WHOLE")
    assert _decide(ai, "how many questions are on page 3?") is False
    assert ai.calls == []


def test_an_explicit_request_for_the_whole_document_is_honoured_directly():
    ai = _RouterAI("LOOKUP")
    assert _decide(ai, "in the entire document, where is overfitting mentioned") is True
    assert ai.calls == []


def test_a_question_with_no_count_or_list_wording_never_costs_a_classifier_call():
    ai = _RouterAI("WHOLE")
    assert _decide(ai, "What accuracy did the model get on MUG?") is False
    assert ai.calls == []


@pytest.mark.parametrize("verdict,expected", [("WHOLE", True), ("whole\n", True), ("LOOKUP", False), ("garbage", False), ("", False)])
def test_the_classifier_decides_when_a_count_word_is_present(verdict, expected):
    ai = _RouterAI(verdict)
    assert _decide(ai, "how many sections of the population were sampled?") is expected
    assert "how many sections of the population" in ai.calls[0][1][1]
    assert ai.calls[0][0][1].startswith("You route a question")


def test_when_the_classifier_fails_the_tightened_regex_decides_and_the_failure_is_not_cached():
    ai = _RouterAI(raises=True)
    assert _decide(ai, "how many questions does it have?") is True  # structural: regex says whole
    assert _decide(ai, "How many subjects are in the MUG database?") is False  # a stated fact: regex says lookup
    ai2 = _RouterAI("LOOKUP")
    assert _decide(ai2, "how many questions does it have?") is False  # recovered classifier gets a say next time


def test_a_verdict_is_cached_so_regenerating_an_answer_costs_no_second_call():
    ai = _RouterAI("WHOLE")
    assert _decide(ai, "How many chapters are there?") is True
    assert _decide(ai, "how many chapters are there? ") is True
    assert len(ai.calls) == 1


_MISROUTED_BEFORE = [
    "How many images does the KDEF database contain?",
    "How many subjects are in the MUG database?",
    "How many unique customers are in the CLV dataset?",
    "How many rows are in the final cleaned CLV dataset?",
    "How many subjects does the last one have?",
]


@pytest.mark.parametrize("question", _MISROUTED_BEFORE)
@pytest.mark.parametrize("classifier_down", [False, True], ids=["classifier-up", "classifier-down"])
def test_ordinary_factual_how_many_questions_no_longer_take_the_whole_document_path(question, classifier_down):
    """These five were sent whole-document by the old bare `how many` pattern (about 15x the cost, and each
    used up the daily allowance) even though the answer is a single stated number."""
    ai = _RouterAI("LOOKUP", raises=classifier_down)
    assert _decide(ai, question) is False


# Development set the tightened regex was built against (see chat_service._AGGREGATE_QUERY_RE's docstring):
# questions that genuinely need the document's own structure counted or listed, vs. ordinary questions whose
# answer merely happens to be a number or a list that the text states. The old bare "how many" pattern
# misrouted 24 of the 29 _REGEX_LOOKUP_CASES below to the whole-document path.
_REGEX_WHOLE_DOCUMENT_CASES = [
    "how many questions does it have?", "How many questions are there in total?", "how many sections does the report have",
    "How many chapters are there?", "How many references does the paper cite?", "how many citations are in this document",
    "list all the sections in this document", "list all references", "List every question in the exam", "enumerate all the topics covered",
    "what is the total number of questions", "count the questions", "how many figures are in the paper?", "how many tables does the report contain?",
    "how many exercises are there", "give me all the questions in the document", "in the entire document, where is overfitting mentioned",
    "how many times does the paper mention transfer learning?", "list all the datasets used", "how many subsections does chapter 3 have",
    "what is the total count of references", "list all the chapters", "how many slides are in the deck", "enumerate every section",
]
_REGEX_LOOKUP_CASES = [
    "How many participants were in the study?", "how many epochs was it trained for?", "How many classes does the softmax output?",
    "how many users were surveyed", "What is the total number of images used for training?", "how many in total were used for testing?",
    "how many parameters does the model have", "how many layers does the network have?", "how many pages does it have?",
    "what is the count of fraud cases in the dataset?", "How many images does the KDEF database contain?", "How many subjects are in the MUG database?",
    "How many unique customers are in the CLV dataset?", "How many rows are in the final cleaned CLV dataset?", "How many subjects does the last one have?",
    "how many folds were used in cross-validation", "how many GPUs were used", "How many authors does the paper have?",
    "what was the total number of transactions", "how many days did training take", "how many clusters did K-Means find?",
    "how many expression classes are there", "how many neurons are in the fully connected layer", "how many samples were in the test set in total",
    "what was the total cost", "explain the methodology", "what does the abstract say", "compare the two approaches", "who is the internal guide",
]


def test_the_tightened_regex_fallback_is_exact_on_the_development_cases():
    from app.services.chat_service import _looks_like_aggregate_query

    assert [q for q in _REGEX_WHOLE_DOCUMENT_CASES if not _looks_like_aggregate_query(q)] == []
    assert [q for q in _REGEX_LOOKUP_CASES if _looks_like_aggregate_query(q)] == []


@pytest.mark.parametrize("verdict", ["WHOLE", "LOOKUP"])
def test_stream_response_follows_the_same_decision_the_route_makes(verdict):
    question = "how many of the sections were about methods?"
    retrieval, ai = _Retrieval(), _RouterAI(verdict)
    _run(ChatService(retrieval, ai).stream_response(
        messages=[{"role": "user", "content": question}], document_ids=["d.pdf"], document_names={"d.pdf": "Doc"}, user_email="u@x.com"))
    assert retrieval.full_document_called is (verdict == "WHOLE")
    assert len(ai.calls) == 1


def test_a_decision_made_by_the_route_is_used_as_is_with_no_second_classifier_call():
    retrieval, ai = _Retrieval(), _RouterAI("LOOKUP")
    _run(ChatService(retrieval, ai).stream_response(
        messages=[{"role": "user", "content": "how many of the sections were about methods?"}], document_ids=["d.pdf"],
        document_names={"d.pdf": "Doc"}, user_email="u@x.com", full_document=True))
    assert retrieval.full_document_called is True
    assert ai.calls == []


# ── the quota counter ────────────────────────────────────────────────────────────────────────────────────
@pytest.fixture
def quota_db(monkeypatch):
    import app.db.session as db_session_module

    monkeypatch.setattr(db_session_module, "SessionLocal", TestingSessionLocal)
    db = TestingSessionLocal()
    users = []
    for _ in range(2):
        u = User(email=f"quota-{uuid.uuid4().hex[:10]}@example.com", email_verified=True)
        db.add(u)
        db.commit()
        db.refresh(u)
        users.append(u.id)
    yield users
    db.query(ChatQuotaUsage).filter(ChatQuotaUsage.user_id.in_(users)).delete(synchronize_session=False)
    db.query(User).filter(User.id.in_(users)).delete(synchronize_session=False)
    db.commit()
    db.close()


def _consume(user, limit, day=None):
    db = TestingSessionLocal()
    try:
        return chat_quota.try_consume(db, user, "full_document", limit, day)
    finally:
        db.close()


def _rows(user_id):
    db = TestingSessionLocal()
    try:
        return db.query(ChatQuotaUsage).filter(ChatQuotaUsage.user_id == user_id).all()
    finally:
        db.close()


def test_the_allowance_is_exactly_the_limit_and_a_denial_costs_nothing(quota_db):
    user = quota_db[0]
    results = [_consume(user, 3) for _ in range(5)]
    assert results == [(True, 1), (True, 2), (True, 3), (False, 3), (False, 3)]
    assert _rows(user)[0].count == 3  # denied requests never push it past the limit


def test_users_and_days_have_separate_allowances(quota_db):
    a, b = quota_db
    today = date.today()
    assert _consume(a, 1, today) == (True, 1)
    assert _consume(a, 1, today)[0] is False
    assert _consume(b, 1, today) == (True, 1)  # another user
    assert _consume(a, 1, today + timedelta(days=1)) == (True, 1)  # next day


def test_limit_zero_means_unlimited_and_records_nothing(quota_db):
    user = quota_db[0]
    assert all(_consume(user, 0) == (True, 0) for _ in range(50))
    assert _rows(user) == []


def test_a_refund_returns_one_use_and_never_goes_below_zero(quota_db):
    user = quota_db[0]
    _consume(user, 2)
    _consume(user, 2)
    assert _consume(user, 2)[0] is False
    chat_quota.refund(user, "full_document")
    assert _consume(user, 2) == (True, 2)
    for _ in range(5):
        chat_quota.refund(user, "full_document")
    assert _rows(user)[0].count == 0


# ── the route ────────────────────────────────────────────────────────────────────────────────────────────
def _chat(client, headers, message="Summarize", action="summarize", docs=("d.pdf",)):
    return client.post(
        "/api/v1/chat",
        json={"messages": [{"role": "user", "content": message}], "document_ids": list(docs), "action": action},
        headers=headers,
    )


@pytest.fixture
def owned_doc(monkeypatch):
    """The route 404s on documents the user doesn't own; make d.pdf resolve for any user."""
    import app.db.session as db_session_module
    from app.api.routes import chat as chat_route

    # chat_quota opens its own session (like the AI-usage recorder), so point it at the test database too.
    monkeypatch.setattr(db_session_module, "SessionLocal", TestingSessionLocal)

    class _Doc:
        original_filename = "Doc.pdf"
        user_email = None
        page_count = 3
        vision_truncated = False

    class _Repo:
        def __init__(self, db):
            pass

        def get_by_stored_filename(self, name):
            d = _Doc()
            d.user_email = _Repo.current_email
            return d

    _Repo.current_email = ""
    monkeypatch.setattr(chat_route, "DocumentRepository", _Repo)
    return _Repo


def test_route_allows_the_limit_then_returns_429_with_a_readable_reason(client, auth_headers, unique_email, owned_doc, setting):
    owned_doc.current_email = unique_email
    setting("chat_full_document_daily_limit", 2)

    assert _chat(client, auth_headers).status_code == 200
    assert _chat(client, auth_headers, message="list all the sections", action=None).status_code == 200  # counting q counts too
    third = _chat(client, auth_headers)

    assert third.status_code == 429
    body = third.json()
    assert body["error"]["code"] == "FULL_DOCUMENT_LIMIT"
    assert "2 whole-document analyses" in body["error"]["message"]
    assert body["error"]["details"] == {"limit": 2}


def test_ordinary_questions_are_never_limited(client, auth_headers, unique_email, owned_doc, setting):
    owned_doc.current_email = unique_email
    setting("chat_full_document_daily_limit", 1)
    assert _chat(client, auth_headers).status_code == 200  # uses the only whole-document slot
    assert _chat(client, auth_headers).status_code == 429
    for _ in range(3):
        assert _chat(client, auth_headers, message="What accuracy did it get on MUG?", action=None).status_code == 200


def test_limit_zero_disables_the_cap(client, auth_headers, unique_email, owned_doc, setting):
    owned_doc.current_email = unique_email
    setting("chat_full_document_daily_limit", 0)
    assert all(_chat(client, auth_headers).status_code == 200 for _ in range(4))


def test_a_request_that_fails_before_any_answer_does_not_use_up_the_allowance(
    client, auth_headers, unique_email, owned_doc, setting
):
    from app.main import app

    owned_doc.current_email = unique_email
    setting("chat_full_document_daily_limit", 1)

    class _Down:
        def validate_latest_message(self, messages):
            pass

        def validate_action(self, action, document_ids):
            pass

        async def decide_full_document(self, messages, action, document_ids):
            return True

        async def stream_response(self, **kwargs):
            raise AppError(code="RETRIEVAL_UNAVAILABLE", message="down", status_code=503)
            yield  # pragma: no cover

    healthy = app.dependency_overrides[service_deps.get_chat_service]
    app.dependency_overrides[service_deps.get_chat_service] = lambda: _Down()
    failed = _chat(client, auth_headers)
    app.dependency_overrides[service_deps.get_chat_service] = healthy

    assert "event: error" in failed.text
    assert _chat(client, auth_headers).status_code == 200  # the only slot is still available


def test_one_users_usage_does_not_affect_another(client, auth_headers, unique_email, owned_doc, setting):
    owned_doc.current_email = unique_email
    setting("chat_full_document_daily_limit", 1)
    assert _chat(client, auth_headers).status_code == 200
    assert _chat(client, auth_headers).status_code == 429

    other_email = f"other-{uuid.uuid4().hex[:10]}@example.com"
    code = client.post("/api/v1/auth/send-otp", json={"email": other_email}).json()["_dev_code"]
    token = client.post("/api/v1/auth/verify-otp", json={"email": other_email, "code": code}).json()["access_token"]
    owned_doc.current_email = other_email
    assert _chat(client, {"Authorization": f"bearer {token}"}).status_code == 200


def test_deleting_an_account_removes_its_usage_counters(client, auth_headers, unique_email, owned_doc, setting):
    owned_doc.current_email = unique_email
    setting("chat_full_document_daily_limit", 5)
    assert _chat(client, auth_headers).status_code == 200

    db = TestingSessionLocal()
    try:
        user_id = db.query(User.id).filter(User.email == unique_email).scalar()
        assert db.query(ChatQuotaUsage).filter(ChatQuotaUsage.user_id == user_id).count() == 1
    finally:
        db.close()

    assert client.delete("/api/v1/auth/account", headers=auth_headers).status_code == 200

    db = TestingSessionLocal()
    try:
        assert db.query(ChatQuotaUsage).filter(ChatQuotaUsage.user_id == user_id).count() == 0
    finally:
        db.close()
