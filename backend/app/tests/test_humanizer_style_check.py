"""Unit tests for style_check.py's deterministic sentence-length and contraction checks
(2026-09-13, Round 34) -- these replace prompt-only instructions that were tested for real
and failed to reliably land (see prompts.py RULE 3's history and STATE.md Round 34)."""

from app.services.humanizer import style_check


def test_sentence_length_findings_flags_paragraph_missing_both_short_and_long():
    # Every sentence sits in the 11-24 word middle band -- exactly the failure mode
    # measured for real against the live pipeline (STATE.md Round 33/34).
    paragraph = (
        "This is a paragraph with several sentences of fairly similar length throughout. "
        "Each one lands somewhere in the middle range without much real variation at all. "
        "Nothing here is genuinely short and nothing here is genuinely long either way."
    )
    findings = style_check.sentence_length_findings([paragraph])
    assert len(findings) == 1
    assert findings[0]["type"] == "sentence_length_uniform"
    assert findings[0]["paragraph"] == 0
    assert "short" in findings[0]["detail"]
    assert "long" in findings[0]["detail"]


def test_sentence_length_findings_passes_a_genuinely_bursty_paragraph():
    paragraph = (
        "Short one here. "
        "This next sentence runs quite a bit longer, winding through several clauses before it "
        "finally arrives at its point, the way a real person rambling through an explanation "
        "actually would. "
        "Medium length sentence in between the two extremes."
    )
    assert style_check.sentence_length_findings([paragraph]) == []


def test_sentence_length_findings_skips_paragraphs_too_short_to_judge():
    # A 1-2 sentence paragraph has no meaningful "variance" to measure.
    findings = style_check.sentence_length_findings(["One short sentence. Another one here."])
    assert findings == []


def test_sentence_length_findings_reports_which_extreme_is_missing():
    # Has a long (34-word) sentence but no short one (16, 17 words) -- only "short"
    # should be named as missing in the finding's detail.
    paragraph = (
        "This first sentence runs on for quite a long while indeed, well past the twenty "
        "five word mark by a good margin, covering plenty of extra ground before it finally "
        "comes to a stop. "
        "This second sentence is also fairly long and covers a similar amount of ground overall today. "
        "And this third one keeps going in the same moderate to long register throughout the whole thing."
    )
    findings = style_check.sentence_length_findings([paragraph])
    assert len(findings) == 1
    missing_clause = findings[0]["detail"].split(". Rewrite")[0]
    assert "short" in missing_clause
    assert "long" not in missing_clause


def test_contraction_findings_flags_casual_paragraph_with_no_contractions():
    paragraph = (
        "It is a solid keyboard that does not disappoint in daily use and it will not let you "
        "down when it matters most for longer typing sessions."
    )
    findings = style_check.contraction_findings([paragraph], register="casual")
    assert len(findings) == 1
    assert findings[0]["type"] == "missing_contractions"
    assert findings[0]["paragraph"] == 0


def test_contraction_findings_ignores_formal_register_entirely():
    # Same zero-contraction paragraph, but formal register genuinely uses few
    # contractions (pre2015_pattern_analysis.py measured ~1/1000w) -- not a defect there.
    paragraph = (
        "It is a solid keyboard that does not disappoint in daily use and it will not let you "
        "down when it matters most for longer typing sessions."
    )
    assert style_check.contraction_findings([paragraph], register="formal") == []


def test_contraction_findings_passes_a_paragraph_with_enough_contractions():
    paragraph = (
        "It's a solid keyboard that doesn't disappoint in daily use, and you'll find it "
        "doesn't let you down when it matters most."
    )
    assert style_check.contraction_findings([paragraph], register="casual") == []


def test_contraction_findings_skips_short_paragraphs():
    findings = style_check.contraction_findings(["It is fine."], register="casual")
    assert findings == []


def test_deterministic_findings_combines_both_checks():
    paragraph = (
        "This is a paragraph with several sentences of fairly similar length throughout. "
        "Each one lands somewhere in the middle range without much real variation at all. "
        "It does not use any contractions anywhere in its entire length at all here."
    )
    findings = style_check.deterministic_findings([paragraph], register="casual")
    types = {f["type"] for f in findings}
    assert "sentence_length_uniform" in types
    assert "missing_contractions" in types
