import asyncio

from app.services.humanizer.detector import (
    analyze,
    flagged_paragraphs,
    findings_summary,
    parse_findings,
    verify,
)


def _run(coro):
    return asyncio.run(coro)


# ── parse_findings: defensive JSON parsing ──────────────────────────────────


def test_parse_findings_returns_empty_list_for_empty_input():
    assert parse_findings("") == []
    assert parse_findings(None) == []


def test_parse_findings_parses_well_formed_json():
    raw = '{"findings": [{"type": "transition_spam", "paragraph": 0, "detail": "moreover"}]}'
    findings = parse_findings(raw)
    assert findings == [{"type": "transition_spam", "paragraph": 0, "detail": "moreover"}]


def test_parse_findings_strips_markdown_code_fences():
    raw = '```json\n{"findings": [{"type": "banned_vocab", "paragraph": null, "detail": "leverage"}]}\n```'
    findings = parse_findings(raw)
    assert findings == [{"type": "banned_vocab", "paragraph": None, "detail": "leverage"}]


def test_parse_findings_handles_malformed_json_gracefully():
    assert parse_findings("this is not json at all") == []
    assert parse_findings('{"findings": [') == []  # truncated
    assert parse_findings("{}") == []  # valid JSON, missing "findings" key
    assert parse_findings('{"findings": "not a list"}') == []
    assert parse_findings("[]") == []  # valid JSON but not an object


def test_parse_findings_drops_malformed_individual_entries():
    raw = '{"findings": [{"type": "x", "detail": "ok"}, {"type": "y"}, "not a dict", 42]}'
    findings = parse_findings(raw)
    assert findings == [{"type": "x", "detail": "ok"}]


# ── flagged_paragraphs / findings_summary ───────────────────────────────────


def test_flagged_paragraphs_collects_distinct_integer_indices():
    findings = [
        {"type": "a", "paragraph": 0, "detail": "x"},
        {"type": "b", "paragraph": 2, "detail": "y"},
        {"type": "c", "paragraph": 0, "detail": "z"},
        {"type": "d", "paragraph": None, "detail": "whole-text issue"},
    ]
    assert flagged_paragraphs(findings) == {0, 2}


def test_findings_summary_empty_for_no_findings():
    assert findings_summary([]) == ""


def test_findings_summary_lists_each_finding():
    findings = [{"type": "transition_spam", "detail": "moreover"}]
    summary = findings_summary(findings)
    assert "transition_spam" in summary
    assert "moreover" in summary


# ── analyze / verify (Pass 1 / Pass 3 entry points) ─────────────────────────


class _FakeAIService:
    def __init__(self, response: str):
        self.response = response
        self.calls = []

    async def classify_humanize(self, messages):
        self.calls.append(messages)
        return self.response


def test_analyze_calls_classify_humanize_and_parses_result():
    fake_ai = _FakeAIService('{"findings": [{"type": "x", "paragraph": 0, "detail": "y"}]}')
    findings = _run(analyze(fake_ai, "some text"))
    assert findings == [{"type": "x", "paragraph": 0, "detail": "y"}]
    assert len(fake_ai.calls) == 1
    assert fake_ai.calls[0][1] == ("human", "some text")


def test_verify_degrades_gracefully_on_malformed_response():
    fake_ai = _FakeAIService("not valid json")
    findings = _run(verify(fake_ai, "rewritten text"))
    assert findings == []
