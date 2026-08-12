"""ChatService's document-scope behaviour:
- no document_ids  -> retrieval is skipped entirely, general prompt used
- document_ids set -> retrieval is scoped + a ground-truth "available
  documents" line (using display names, not raw stored_filenames) is
  always present, independent of what retrieval matched
"""
import asyncio

import pytest

from app.core.exceptions import AppError
from app.services.chat_service import ChatService, GENERAL_SYSTEM_PROMPT, GROUNDED_SYSTEM_PROMPT, _extract_page_numbers
from app.services.runtime_settings import runtime_settings
from app.tests.conftest import TestingSessionLocal


@pytest.mark.parametrize(
    "text,expected",
    [
        ("which question is in 25 page.", [25]),
        ("what is on page 12?", [12]),
        ("page 3 content", [3]),
        ("page number 7", [7]),
        ("what's on the 1st page", [1]),
        ("compare page 3 and page 8", [3, 8]),
        ("how many pages does it have", []),  # "pages" (plural) must not false-positive
        ("what does the introduction say?", []),
        ("", []),
    ],
)
def test_extract_page_numbers(text, expected):
    assert _extract_page_numbers(text) == expected


def test_grounded_prompt_forbids_blending_general_knowledge():
    """Regression guard: rule 9 is the direct fix for a user-reported
    real-world failure mode — an LLM confidently blending its own general
    knowledge into a grounded answer, producing a plausible-looking answer
    that doesn't actually match the specific document (e.g. a professor's
    notes, where the expected answer is that document's exact wording, not
    a generic textbook answer). Guards against this instruction being lost
    in a future prompt edit, since there's no way to behaviorally test an
    LLM's actual response without a real API call."""
    assert "never supplement" in GROUNDED_SYSTEM_PROMPT
    assert "blend it with your own general" in GROUNDED_SYSTEM_PROMPT
    assert "defer to the document" in GROUNDED_SYSTEM_PROMPT


def _run(agen):
    """Drain an async generator synchronously — avoids depending on the
    pytest-asyncio plugin (listed in requirements.txt but not installed in
    this venv) just for two tests."""
    async def collect():
        return [item async for item in agen]

    return asyncio.run(collect())


class RecordingRetrievalService:
    def __init__(self, max_pages=None, full_document_context=None, context="", page_context=None):
        self.called = False
        self.last_kwargs = None
        self.full_document_called = False
        self.full_document_last_kwargs = None
        self.page_called = False
        self.page_last_kwargs = None
        self._max_pages = max_pages or {}
        self._full_document_context = full_document_context
        self._context = context
        self._page_context = page_context

    def retrieve_context(self, query, source_ids=None, n_results=None, user_email="", source_names=None):
        self.called = True
        self.last_kwargs = {"source_ids": source_ids, "user_email": user_email, "source_names": source_names}
        return {"context": self._context, "sources": []}

    def get_max_indexed_pages(self, source_ids, user_email=""):
        return {k: v for k, v in self._max_pages.items() if k in (source_ids or [])}

    def get_full_document_context(self, source_ids, user_email="", source_names=None, max_chars=None):
        self.full_document_called = True
        self.full_document_last_kwargs = {"source_ids": source_ids, "user_email": user_email}
        if self._full_document_context is not None:
            return self._full_document_context
        return {"context": "", "truncated": False, "chunk_count": 0}

    def get_page_context(self, source_ids, pages, user_email="", source_names=None):
        self.page_called = True
        self.page_last_kwargs = {"source_ids": source_ids, "pages": pages, "user_email": user_email}
        if self._page_context is not None:
            return self._page_context
        return {"context": "", "chunk_count": 0, "found_pages": [], "missing_pages": pages}


class RecordingAIService:
    def __init__(self):
        self.last_messages = None

    async def stream_chat(self, messages):
        self.last_messages = messages
        yield "ok"


def test_no_documents_skips_retrieval_and_uses_general_prompt():
    retrieval = RecordingRetrievalService()
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    events = _run(service.stream_response(messages=[{"role": "user", "content": "hi"}], document_ids=None))

    assert retrieval.called is False
    assert events[0] == {"type": "sources", "sources": []}
    system_prompt = ai.last_messages[0][1]
    assert system_prompt == GENERAL_SYSTEM_PROMPT
    assert "document" not in system_prompt.lower() or "no documents are selected" in system_prompt.lower()


def test_documents_selected_scopes_retrieval_and_names_are_resolved():
    retrieval = RecordingRetrievalService()
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    events = _run(
        service.stream_response(
            messages=[{"role": "user", "content": "compare them"}],
            document_ids=["uuid-a.pdf", "uuid-b.pdf"],
            document_names={"uuid-a.pdf": "Report A.pdf", "uuid-b.pdf": "Report B.pdf"},
            user_email="a@example.com",
        )
    )

    assert retrieval.called is True
    assert retrieval.last_kwargs["source_ids"] == ["uuid-a.pdf", "uuid-b.pdf"]
    assert retrieval.last_kwargs["source_names"] == {"uuid-a.pdf": "Report A.pdf", "uuid-b.pdf": "Report B.pdf"}

    system_prompt = ai.last_messages[0][1]
    assert "Documents available in this conversation: Report A.pdf, Report B.pdf" in system_prompt
    # The raw stored-filename ids must never leak into the prompt the model sees.
    assert "uuid-a.pdf" not in system_prompt
    assert "uuid-b.pdf" not in system_prompt


def test_scope_line_carries_a_real_queried_page_count():
    """The model must be given an actual, queried page count (a lower bound,
    computed from real chunk metadata) rather than being left to guess a
    total from whatever chunks retrieval happened to surface — this is the
    concrete fix for a live-reproduced bug where the assistant confidently
    stated a different "confirmed" question/page count on every turn."""
    retrieval = RecordingRetrievalService(max_pages={"uuid-a.pdf": 36})
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "how many pages does it have?"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Report A.pdf"},
            user_email="a@example.com",
        )
    )

    system_prompt = ai.last_messages[0][1]
    assert "Report A.pdf (at least 36 pages indexed)" in system_prompt


# ── Aggregate/counting queries: whole-document mode ───────────────────────────
# Fixes a live-reproduced bug: "how many questions does it have" only ever hit
# top-k similarity retrieval (6 chunks), so the model extrapolated a different
# "confirmed" count on every turn. These questions must bypass top-k retrieval
# entirely and get the whole document instead.

def test_aggregate_query_uses_full_document_not_topk_retrieval():
    retrieval = RecordingRetrievalService(
        full_document_context={"context": "[SOURCE: Doc.pdf | PAGE: 1]\nQ1) ...", "truncated": False, "chunk_count": 40}
    )
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "how many questions does it have?"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Doc.pdf"},
            user_email="a@example.com",
        )
    )

    assert retrieval.full_document_called is True
    assert retrieval.called is False  # top-k retrieve_context must not run at all

    system_prompt = ai.last_messages[0][1]
    assert "NEAR-COMPLETE DOCUMENT" in system_prompt
    assert "Q1) ..." in system_prompt


def test_aggregate_query_truncated_document_is_labelled_as_a_lower_bound():
    retrieval = RecordingRetrievalService(
        full_document_context={"context": "[SOURCE: Doc.pdf]\nsome content", "truncated": True, "chunk_count": 500}
    )
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "list all the sections in this document"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Doc.pdf"},
            user_email="a@example.com",
        )
    )

    system_prompt = ai.last_messages[0][1]
    assert "LARGE-DOCUMENT CONTEXT (truncated" in system_prompt
    assert "not guaranteed exact" in system_prompt


def test_aggregate_query_falls_back_to_retrieval_when_no_chunks_ingested_yet():
    """A document still processing (no chunks yet) must not silently produce
    an empty "NEAR-COMPLETE DOCUMENT" claim — fall back to the normal
    top-k path, which correctly reports "no relevant content"."""
    retrieval = RecordingRetrievalService(full_document_context={"context": "", "truncated": False, "chunk_count": 0})
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "how many questions does it have?"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Doc.pdf"},
            user_email="a@example.com",
        )
    )

    assert retrieval.full_document_called is True
    assert retrieval.called is True  # fell back to top-k retrieval


def test_non_aggregate_query_still_uses_topk_retrieval():
    retrieval = RecordingRetrievalService(context="[SOURCE: Doc.pdf | PAGE: 1]\nThe introduction covers...")
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "what does the introduction say?"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Doc.pdf"},
            user_email="a@example.com",
        )
    )

    assert retrieval.full_document_called is False
    assert retrieval.called is True

    system_prompt = ai.last_messages[0][1]
    assert "PARTIAL EXCERPTS" in system_prompt


# ── Page-specific queries: exact structural lookup, not similarity search ────
# Fixes a live-reproduced bug: "which question is in 25 page" went through
# top-k similarity retrieval (a page number has no semantic meaning to match
# on), returned chunks not reliably from page 25 at all, and the model
# produced a self-contradictory citation ("page 22 excerpt, but indicated as
# part of the content around page 25").

def test_page_specific_query_uses_exact_page_lookup_not_similarity_search():
    retrieval = RecordingRetrievalService(
        page_context={
            "context": "[SOURCE: Doc.pdf | PAGE: 25]\nQ24) ...\nQ25) ...",
            "chunk_count": 2,
            "found_pages": [25],
            "missing_pages": [],
        }
    )
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "which question is in 25 page."}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Doc.pdf"},
            user_email="a@example.com",
        )
    )

    assert retrieval.page_called is True
    assert retrieval.page_last_kwargs["pages"] == [25]
    assert retrieval.called is False  # top-k retrieve_context must not run
    assert retrieval.full_document_called is False

    system_prompt = ai.last_messages[0][1]
    assert "EXACT PAGE MATCH for page(s) 25" in system_prompt
    assert "Q24) ..." in system_prompt


def test_page_specific_query_phrased_as_on_page_n_also_matches():
    retrieval = RecordingRetrievalService(
        page_context={
            "context": "[SOURCE: Doc.pdf | PAGE: 12]\ncontent",
            "chunk_count": 1,
            "found_pages": [12],
            "missing_pages": [],
        }
    )
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "what is on page 12?"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Doc.pdf"},
            user_email="a@example.com",
        )
    )

    assert retrieval.page_last_kwargs["pages"] == [12]


def test_page_specific_query_with_no_indexed_content_says_so_plainly():
    """No chunk on that exact page — must state that as a definitive fact,
    never silently substitute content from a different page."""
    retrieval = RecordingRetrievalService(
        page_context={"context": "", "chunk_count": 0, "found_pages": [], "missing_pages": [99]}
    )
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "what's on page 99?"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Doc.pdf"},
            user_email="a@example.com",
        )
    )

    system_prompt = ai.last_messages[0][1]
    assert "No content is indexed for page(s) 99" in system_prompt
    assert "do not substitute content from a different page" in system_prompt


def test_page_query_takes_priority_over_aggregate_detection():
    """"how many questions are on page 25" matches both the page-number
    pattern and the aggregate/counting pattern — the page-specific exact
    lookup must win, since it's the more precise, more reliable retrieval
    mode for a query that names an exact page."""
    retrieval = RecordingRetrievalService(
        page_context={
            "context": "[SOURCE: Doc.pdf | PAGE: 25]\ncontent",
            "chunk_count": 1,
            "found_pages": [25],
            "missing_pages": [],
        }
    )
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "how many questions are on page 25?"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Doc.pdf"},
            user_email="a@example.com",
        )
    )

    assert retrieval.page_called is True
    assert retrieval.full_document_called is False


def test_page_specific_query_no_sources_chip_when_nothing_found():
    """Regression guard for the second-audit finding: the sources chip was
    previously shown unconditionally on a page-lookup response, so a "no
    content indexed for that page" answer still rendered a citation chip
    implying it was grounded in a document that in fact contributed nothing."""
    retrieval = RecordingRetrievalService(
        page_context={"context": "", "chunk_count": 0, "found_pages": [], "missing_pages": [99]}
    )
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    events = _run(
        service.stream_response(
            messages=[{"role": "user", "content": "what's on page 99?"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Doc.pdf"},
            user_email="a@example.com",
        )
    )

    assert events[0] == {"type": "sources", "sources": []}


def test_page_specific_query_multi_page_reports_found_and_missing_individually():
    """A multi-page question ("compare page 3 and page 8") where only some
    of the named pages actually have content must address every page
    individually, not silently answer from the ones that were found."""
    retrieval = RecordingRetrievalService(
        page_context={
            "context": "[SOURCE: Doc.pdf | PAGE: 3]\ncontent",
            "chunk_count": 1,
            "found_pages": [3],
            "missing_pages": [8],
        }
    )
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "compare page 3 and page 8"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Doc.pdf"},
            user_email="a@example.com",
        )
    )

    assert retrieval.page_last_kwargs["pages"] == [3, 8]
    system_prompt = ai.last_messages[0][1]
    assert "content found for page(s) 3" in system_prompt
    assert "NO content indexed for page(s) 8" in system_prompt


def test_scope_line_notes_vision_truncation_for_flagged_documents():
    """Fix for the second-audit finding: the per-upload vision page cap
    previously dropped diagram/chart pages with zero signal anywhere — the
    model would answer visual questions as if its coverage were complete.
    A document flagged in vision_truncated_documents must get an in-band
    note in its scope-line entry."""
    retrieval = RecordingRetrievalService(max_pages={"uuid-a.pdf": 40})
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "hi"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Report A.pdf"},
            document_page_counts={"uuid-a.pdf": 40},
            vision_truncated_documents={"uuid-a.pdf"},
            user_email="a@example.com",
        )
    )

    system_prompt = ai.last_messages[0][1]
    assert "Report A.pdf (40 pages) — note: this document has more diagrams/charts than could be indexed" in system_prompt


def test_scope_line_omits_page_count_when_none_indexed():
    """A document with no chunk-level page metadata (e.g. still processing,
    or ingestion never recorded pages) must not fabricate a page count."""
    retrieval = RecordingRetrievalService(max_pages={})
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "hi"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Report A.pdf"},
            user_email="a@example.com",
        )
    )

    system_prompt = ai.last_messages[0][1]
    # The scope line itself must list the document with no page-count
    # suffix — checked precisely, since "pages indexed" also appears in the
    # rule text explaining the feature, not just in an actual scope line.
    assert "Documents available in this conversation: Report A.pdf." in system_prompt
    assert "Report A.pdf (at least" not in system_prompt


def test_scope_line_states_confirmed_page_count_with_no_hedging():
    """The real, ingestion-time PDF page count (Document.page_count) must be
    stated plainly — "(N pages)", no "at least" — since it's an exact fact,
    not a lower bound. This is the direct fix for a user-reported trust
    complaint: "at least 37 pages" read as evasive when 37 was already the
    confirmed, exact total."""
    retrieval = RecordingRetrievalService(max_pages={"uuid-a.pdf": 30})  # a weaker signal, must be ignored
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "hi"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Report A.pdf"},
            document_page_counts={"uuid-a.pdf": 37},
            user_email="a@example.com",
        )
    )

    system_prompt = ai.last_messages[0][1]
    # Assert the exact scope line, not just a substring — rule 5's own
    # explanatory text legitimately contains "at least" too, so a loose
    # substring check across the whole prompt would be a false negative.
    assert "\n\nDocuments available in this conversation: Report A.pdf (37 pages)." in system_prompt


def test_scope_line_falls_back_to_hedged_indexed_pages_when_no_confirmed_count():
    """A legacy document with no stored page_count (ingested before this
    feature existed) still gets the older, honestly-hedged lower bound."""
    retrieval = RecordingRetrievalService(max_pages={"uuid-a.pdf": 30})
    ai = RecordingAIService()
    service = ChatService(retrieval_service=retrieval, ai_service=ai)

    _run(
        service.stream_response(
            messages=[{"role": "user", "content": "hi"}],
            document_ids=["uuid-a.pdf"],
            document_names={"uuid-a.pdf": "Report A.pdf"},
            document_page_counts={},
            user_email="a@example.com",
        )
    )

    system_prompt = ai.last_messages[0][1]
    assert "Report A.pdf (at least 30 pages indexed)" in system_prompt


# ── validate_latest_message: the per-message character cap ───────────────────
# Previously nothing enforced this anywhere (frontend or backend) despite the
# chat input visibly claiming a "4,000 (limit exceeded)" state.

def test_validate_latest_message_rejects_over_limit_user_message():
    service = ChatService(retrieval_service=RecordingRetrievalService(), ai_service=RecordingAIService())
    db = TestingSessionLocal()
    try:
        runtime_settings.set(db, "chat_max_chars", 500)
        with pytest.raises(AppError) as exc_info:
            service.validate_latest_message([{"role": "user", "content": "x" * 501}])
        assert exc_info.value.code == "TEXT_TOO_LONG"
        assert exc_info.value.status_code == 413
    finally:
        runtime_settings.set(db, "chat_max_chars", 4000)
        db.close()


def test_validate_latest_message_allows_message_at_exactly_the_limit():
    service = ChatService(retrieval_service=RecordingRetrievalService(), ai_service=RecordingAIService())
    db = TestingSessionLocal()
    try:
        runtime_settings.set(db, "chat_max_chars", 500)
        service.validate_latest_message([{"role": "user", "content": "x" * 500}])  # must not raise
    finally:
        runtime_settings.set(db, "chat_max_chars", 4000)
        db.close()


def test_validate_latest_message_only_checks_the_newest_user_turn():
    """An over-limit message earlier in history (sent back when the cap was
    looser, or simply older) must not block sending a new, valid message —
    only the newest user turn is the one actually being submitted right now."""
    service = ChatService(retrieval_service=RecordingRetrievalService(), ai_service=RecordingAIService())
    db = TestingSessionLocal()
    try:
        runtime_settings.set(db, "chat_max_chars", 500)
        service.validate_latest_message(
            [
                {"role": "user", "content": "x" * 5000},
                {"role": "assistant", "content": "ok"},
                {"role": "user", "content": "short"},
            ]
        )  # must not raise — only the trailing "short" message is checked
    finally:
        runtime_settings.set(db, "chat_max_chars", 4000)
        db.close()
