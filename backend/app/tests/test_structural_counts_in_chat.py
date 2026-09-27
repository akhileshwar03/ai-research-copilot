"""ChatService.stream_response carries a document's real structural counts (see structure_detector.py) into
the scope line the model sees, so a "how many references does this cite?" question is answered from a real
fact instead of the model counting from a handful of retrieved chunks or a truncated whole-document view."""

import asyncio

from app.services.chat_service import GROUNDED_SYSTEM_PROMPT, ChatService


def _run(agen):
    async def collect():
        return [item async for item in agen]

    return asyncio.run(collect())


class _Retrieval:
    async def retrieve_context(self, query, **k):
        return {"context": "[SOURCE: Doc]\ntext", "sources": ["d.pdf"]}

    def get_max_indexed_pages(self, *a, **k):
        return {}

    def get_full_document_context(self, *a, **k):
        return {"context": "[SOURCE: Doc]\nfull", "truncated": False, "chunk_count": 1, "truncated_sources": []}


class _AI:
    last = None

    async def stream_chat(self, messages):
        _AI.last = messages
        yield "ok"

    async def classify(self, messages):
        return "[]"


def _scope_line(structural_counts, message="what is the abstract about?"):
    _run(
        ChatService(_Retrieval(), _AI()).stream_response(
            messages=[{"role": "user", "content": message}],
            document_ids=["d.pdf"],
            document_names={"d.pdf": "Doc.pdf"},
            document_structural_counts=structural_counts,
            user_email="u@x.com",
        )
    )
    return _AI.last[0][1]


def test_an_exact_count_is_shown_plainly():
    system = _scope_line({"d.pdf": {"references": {"count": 40, "exact": True}}})
    assert "40 references" in system
    # the other two facts are unknown here -- each must say so explicitly,
    # not just be silently omitted (that's the whole point of the hardening).
    assert "figures: not available for this document" in system
    assert "tables: not available for this document" in system


def test_a_lower_bound_count_is_shown_hedged():
    system = _scope_line({"d.pdf": {"figures": {"count": 33, "exact": False}}})
    assert "at least 33 figures" in system


def test_multiple_counts_for_one_document_are_all_shown():
    system = _scope_line(
        {"d.pdf": {"references": {"count": 40, "exact": True}, "figures": {"count": 5, "exact": True}, "tables": {"count": 4, "exact": True}}}
    )
    assert "[40 references, 5 figures, 4 tables]" in system


def test_no_counts_at_all_means_all_three_marked_not_available():
    """No silent omission: a document with none of the three facts known must say so for
    each one individually, so the model has something concrete to defer to no matter which
    fact (or combination) the question asks about -- see the 2026-09-27 production finding
    where an omitted bracket let the model quietly fall back to counting from excerpts for
    figures/tables while correctly declining to guess for references, in the same reply."""
    system = _scope_line({})
    start = system.rindex("Documents available in this conversation:")
    scope_sentence = system[start:].split("\n\nDOCUMENT CONTEXT", 1)[0]
    assert "references: not available for this document" in scope_sentence
    assert "figures: not available for this document" in scope_sentence
    assert "tables: not available for this document" in scope_sentence


def test_a_partially_known_document_marks_only_the_missing_facts():
    system = _scope_line({"d.pdf": {"references": {"count": 40, "exact": True}, "tables": {"count": 4, "exact": True}}})
    # scoped to the real scope line -- rule 11's own explanatory prose uses
    # "not available for this document" too, as a worked example.
    start = system.rindex("Documents available in this conversation:")
    scope_sentence = system[start:].split("\n\nDOCUMENT CONTEXT", 1)[0]
    assert "40 references" in scope_sentence
    assert "4 tables" in scope_sentence
    assert "figures: not available for this document" in scope_sentence
    assert "references: not available" not in scope_sentence
    assert "tables: not available" not in scope_sentence


def test_counts_are_carried_regardless_of_which_retrieval_mode_the_question_takes():
    """The fact must reach the model whether the question is routed to retrieval, whole-document, or page
    lookup -- it's part of the scope line, not something only the whole-document path adds."""
    counts = {"d.pdf": {"references": {"count": 105, "exact": True}}}
    for message in ("what is the abstract about?", "how many references does this cite?"):
        system = _scope_line(counts, message=message)
        assert "105 references" in system


def test_the_system_prompt_tells_the_model_to_defer_to_the_fact_not_count_itself():
    assert "never try to count these yourself" in GROUNDED_SYSTEM_PROMPT.lower()
    assert "cannot reliably determine that count" in GROUNDED_SYSTEM_PROMPT
