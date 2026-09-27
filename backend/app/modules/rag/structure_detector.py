"""Deterministic, regex-based counts of a document's own structural elements -- references, figures,
tables -- computed once from the full extracted text at ingestion time, the same way total_pages is: a
real fact about the file, never a model's guess over a truncated context window.

Why this exists: "how many references does this cite?" used to be answered by feeding the model up to
rag_full_document_max_chars of the document and asking it to count -- which structurally cannot work on a
document too large to fit (see get_full_document_context's own docstring), and produced wrong or hedged
answers even on documents that DID fit, because the reference list itself sits far enough into the text to
be truncated (measured 2026-09-27: a document's own answer to "how many references" was wrong on 4/6 real
test questions, even for documents small enough to mostly fit).

Measured against 7 real, varied documents on 2026-09-27 (rag_eval_big-style corpus): a naive "find the
highest number of the form '[N]' or 'Figure N' anywhere" is not enough on its own -- one document matched
distinct=8 different reference numbers but a highest number of 98 (clearly not 98 real references; the
plain "N. Capitalized text" fallback pattern was matching stray numbered text elsewhere, not a real
reference list). The fix is a coverage check: only trust the detected highest number when most of the
numbers from 1 up to it were actually found.
"""

import dataclasses
import re

# A numbered bibliography entry: "[12] Author, Title..." (most common in CS/ML papers) or, if that pattern
# finds nothing under the References heading, "12. Author, Title..." (used by some venues/formatters).
_BRACKET_REF_RE = re.compile(r"(?m)^\s*\[(\d+)\]")
_DOTTED_REF_RE = re.compile(r"(?m)^\s*(\d{1,4})\.\s+[A-Z]")
_REFERENCES_HEADING_RE = re.compile(r"(?im)^\s*(references|bibliography)\s*$")

_FIGURE_CAPTION_RE = re.compile(r"\bFigure\s+(\d{1,3})[:.]")
_TABLE_CAPTION_RE = re.compile(r"\bTable\s+(\d{1,3})[:.]")

# How much of the run 1..max_number must actually have been found before the count is trustworthy at all.
_MIN_COVERAGE_FOR_LOWER_BOUND = 0.75
# Above this, few enough numbers are missing that the max is treated as an exact count, not just a floor --
# real documents lose the occasional match to a page break or an OCR glitch even when the true count equals
# the highest number seen.
_MIN_COVERAGE_FOR_EXACT = 0.95
_MAX_PLAUSIBLE_COUNT = 3000  # a sanity ceiling; anything higher is almost certainly a false match, not a real count


@dataclasses.dataclass(frozen=True)
class StructuralCount:
    """count is None when nothing reliable could be determined -- report that honestly, never a guess.
    When count is set, exact=True means "the document has exactly this many"; exact=False means "at least
    this many, but a few entries could not be individually located" (report as a lower bound, same
    convention the rest of chat_service.py already uses for a truncated whole-document count)."""

    count: int | None
    exact: bool = False


def _count_from_numbers(numbers: list[int]) -> StructuralCount:
    if not numbers:
        return StructuralCount(count=None)
    distinct = sorted(set(numbers))
    highest = distinct[-1]
    if highest > _MAX_PLAUSIBLE_COUNT or distinct[0] > 2:
        return StructuralCount(count=None)
    coverage = len(distinct) / highest
    if coverage >= _MIN_COVERAGE_FOR_EXACT:
        return StructuralCount(count=highest, exact=True)
    if coverage >= _MIN_COVERAGE_FOR_LOWER_BOUND:
        return StructuralCount(count=highest, exact=False)
    return StructuralCount(count=None)


def detect_reference_count(full_text: str) -> StructuralCount:
    """Finds the LAST "References"/"Bibliography" heading (a document can mention the word earlier, e.g.
    in an abstract or a related-work section, so only the final occurrence is trusted as the real list's
    start) and counts numbered entries after it. Returns count=None for a document with no numbered
    reference list at all (author-year style citations, or no bibliography, e.g. most NIST publications) --
    that is a real "not applicable", not a failure."""
    end_of_heading = None
    for m in _REFERENCES_HEADING_RE.finditer(full_text):
        end_of_heading = m.end()
    if end_of_heading is None:
        return StructuralCount(count=None)
    tail = full_text[end_of_heading:]
    numbers = [int(n) for n in _BRACKET_REF_RE.findall(tail)]
    if not numbers:
        numbers = [int(n) for n in _DOTTED_REF_RE.findall(tail)]
    return _count_from_numbers(numbers)


def detect_figure_count(full_text: str) -> StructuralCount:
    return _count_from_numbers([int(n) for n in _FIGURE_CAPTION_RE.findall(full_text)])


def detect_table_count(full_text: str) -> StructuralCount:
    return _count_from_numbers([int(n) for n in _TABLE_CAPTION_RE.findall(full_text)])
