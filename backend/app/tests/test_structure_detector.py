"""structure_detector: deterministic reference/figure/table counts from a document's own full text.

Verified 2026-09-27/28 against 7 real, varied PDFs (research papers, a NIST framework, a 492-page controls
catalog): exact matches on every document with a known real count (attention: 40 refs/5 figs/4 tables;
GPT-4 report: 105 refs/11 figs/19 tables; NIST CSF 2.0: 2 tables), and the one real dangerous case -- a
document whose reference numbers matched distinct=8 different values but a highest number of 98 -- was
correctly rejected (None) instead of surfacing the wrong "98". These tests pin the coverage-gate logic that
made that rejection possible.
"""

from app.modules.rag.structure_detector import detect_figure_count, detect_reference_count, detect_table_count


def _refs(*nums: int, heading: str = "References") -> str:
    body = "\n".join(f"[{n}] Some Author. Some Title. Some Venue, {2020 + n % 5}." for n in nums)
    return f"Section 1\nSome text.\n\n{heading}\n{body}\n"


def test_a_clean_contiguous_reference_list_is_reported_exact():
    text = _refs(*range(1, 41))  # the real Attention Is All You Need count
    result = detect_reference_count(text)
    assert result.count == 40 and result.exact is True


def test_a_garbage_match_with_low_coverage_is_rejected_not_guessed():
    """The real failure this exists to prevent: distinct=8, highest=98 -- clearly not a 98-entry
    reference list, but a naive "take the highest number" detector would have reported exactly that."""
    text = _refs(1, 2, 3, 4, 5, 6, 7, 98)
    result = detect_reference_count(text)
    assert result.count is None


def test_a_mostly_but_not_fully_contiguous_list_is_a_lower_bound_not_exact():
    nums = list(range(1, 34))
    nums.remove(17)
    nums.remove(29)  # 31 of 33 found -- real gaps a page-break/extraction glitch would plausibly cause
    text = _refs(*nums)
    result = detect_reference_count(text)
    assert result.count == 33 and result.exact is False


def test_no_references_heading_at_all_is_none_not_zero():
    """A document with no numbered bibliography (author-year citations, or a policy document with none at
    all, e.g. most NIST publications) must report "cannot determine", never a false "zero"."""
    text = "Section 1\nSome text with no reference list anywhere in it.\n"
    assert detect_reference_count(text).count is None


def test_only_the_last_references_heading_is_used():
    """The word "References" can appear earlier (an abstract, a related-work section) without starting the
    real bibliography -- only the final occurrence in the document is trusted as its start."""
    text = "Our References section will list every citation.\n\n" + _refs(1, 2, 3, 4, 5)
    result = detect_reference_count(text)
    assert result.count == 5


def test_a_document_with_two_real_reference_lists_uses_the_more_complete_one():
    """The real regression this guards against (2026-09-27/28, GPT-4 Technical Report,
    verified against the actual PDF): some documents genuinely have two distinct, real
    numbered reference lists -- e.g. a main paper's own bibliography followed, many pages
    later, by an appendix/system-card section with its own separate "References" heading and
    numbered list. Blindly trusting "the last References heading" is only safe because the
    later, real list here also happens to be the complete one ([1]-[105], not a partial
    subset) -- this pins that real, verified case, not just a synthetic one with a single
    real list and an incidental earlier mention of the word."""
    early_list = _refs(*range(1, 86))  # a genuine but partial numbered list (as one really appeared)
    late_list = _refs(*range(1, 106))  # the complete, later list -- must be what's reported
    text = f"{early_list}\n\nAppendix\nMore text.\n\n{late_list}"
    result = detect_reference_count(text)
    assert result.count == 105 and result.exact is True


def test_the_dotted_style_fallback_is_used_when_no_bracket_style_entries_exist():
    body = "\n".join(f"{n}. Some Author. Some Title. Venue, {2020 + n % 5}." for n in range(1, 16))
    text = f"References\n{body}\n"
    result = detect_reference_count(text)
    assert result.count == 15 and result.exact is True


def test_figure_captions_are_counted_the_same_way():
    text = "\n".join(f"Figure {n}: some caption text." for n in range(1, 6))
    result = detect_figure_count(text)
    assert result.count == 5 and result.exact is True


def test_table_captions_are_counted_the_same_way():
    text = "\n".join(f"Table {n}. some caption text." for n in range(1, 5))
    result = detect_table_count(text)
    assert result.count == 4 and result.exact is True


def test_no_figures_or_tables_at_all_is_none():
    assert detect_figure_count("Just plain prose, no captions here.").count is None
    assert detect_table_count("Just plain prose, no captions here.").count is None


def test_an_implausibly_high_number_is_rejected_as_a_sanity_check():
    text = _refs(1, 2, 3, 4004)  # clearly not a real 4000+ entry bibliography
    assert detect_reference_count(text).count is None
