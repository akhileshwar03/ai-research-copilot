"""Unit tests for PaperAnalyzerService against PDFs with deterministic,
known-in-advance geometry (built with reportlab, not the app's own code) —
this is math/measurement code, so tests assert on real, precisely
constructed layouts rather than mocked LLM responses.
"""

import io

import pytest
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from app.core.exceptions import AppError
from app.services.paper_analyzer_service import PaperAnalyzerService

PAGE_W, PAGE_H = letter  # 612 x 792 pt

_WORDS_POOL = [
    "Research", "shows", "that", "careful", "formatting", "matters", "for",
    "readability", "and", "overall", "clarity", "when", "presenting", "results",
    "to", "a", "wider", "audience", "of", "readers", "across", "many", "fields",
]


def _fill_line(start_idx: int, max_width: float, font: str, size: float) -> tuple[list[str], int]:
    """Greedily pack words from the pool until the next word would exceed
    `max_width` — mirrors how real word-wrapped text fills a line."""
    words: list[str] = []
    idx = start_idx
    width = 0.0
    space_w = stringWidth(" ", font, size)
    while len(words) < 14:
        w = _WORDS_POOL[idx % len(_WORDS_POOL)]
        extra = stringWidth(w, font, size) + (space_w if words else 0.0)
        if width + extra > max_width and words:
            break
        width += extra
        words.append(w)
        idx += 1
    return words, idx


def _draw_justified_line(c, words, x0, x1, y, font, size):
    c.setFont(font, size)
    space_w = c.stringWidth(" ", font, size)
    words_w = sum(c.stringWidth(w, font, size) for w in words)
    n_gaps = len(words) - 1
    gap = space_w + (x1 - x0 - words_w - space_w * n_gaps) / n_gaps if n_gaps > 0 else space_w
    x = x0
    for i, w in enumerate(words):
        c.drawString(x, y, w)
        x += c.stringWidth(w, font, size)
        if i < len(words) - 1:
            x += gap


def _apa_shaped_pdf(
    margin_in: float = 1.0,
    font: str = "Times-Roman",
    size: float = 12,
    gap_pt: float = 24.0,
    justified: bool = False,
    page_number: bool = True,
    n_lines: int = 8,
    pages: int = 1,
) -> bytes:
    """A single/multi-page document with body text starting at `margin_in`
    from each edge, `n_lines` lines spaced `gap_pt` apart, optionally
    right-justified, optionally with a top-right page number. Lines are
    packed to (near) full width so the right/bottom margins are actually
    reached — a block of short lines would understate the page's real
    margins, since nothing in the document would extend that far."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    margin = margin_in * 72
    x0, x1 = margin, PAGE_W - margin
    full_width = x1 - x0

    for _ in range(pages):
        c.setFont(font, size)
        y = PAGE_H - margin
        idx = 0
        for i in range(n_lines):
            if justified:
                words, idx = _fill_line(idx, full_width * 0.95, font, size)
                _draw_justified_line(c, words, x0, x1, y, font, size)
            else:
                # Occasional shorter "end of paragraph" line; otherwise pack
                # to the *full* column width and let the greedy word-packer
                # stop wherever the next word would overflow — that natural
                # per-line remainder (not a fixed target fraction) is what
                # produces authentic ragged-right variance, the same way
                # real word-wrapped text behaves.
                target = full_width * 0.5 if i % 4 == 3 else full_width
                words, idx = _fill_line(idx, target, font, size)
                c.drawString(x0, y, " ".join(words))
            y -= gap_pt
        # Anchors both the bottom and right margin measurements at the exact
        # corner of the text box — without this, greedy word-wrap naturally
        # falls a bit short of the true column width on every line, and a
        # short block of lines near the top leaves the bottom unmeasurable.
        c.setFont(font, min(size, 10))
        c.drawRightString(x1, margin, "End of page.")
        if page_number:
            c.setFont("Times-Roman", 10)
            c.drawRightString(PAGE_W - margin, PAGE_H - 40, "1")
        c.showPage()

    c.save()
    return buf.getvalue()


@pytest.fixture
def service() -> PaperAnalyzerService:
    return PaperAnalyzerService()


# ── Margins ──────────────────────────────────────────────────────────────


def test_margins_detects_one_inch(service):
    pdf = _apa_shaped_pdf(margin_in=1.0)
    result = service.analyze(pdf, "apa")
    margins_check = next(c for c in result["checks"] if c["id"] == "margins")
    assert margins_check["status"] == "pass"
    assert margins_check["score"] >= 85


def test_margins_flags_narrow_margins(service):
    pdf = _apa_shaped_pdf(margin_in=0.5)
    result = service.analyze(pdf, "apa")
    margins_check = next(c for c in result["checks"] if c["id"] == "margins")
    assert margins_check["status"] == "fail"
    assert margins_check["score"] < 50


# ── Line spacing ─────────────────────────────────────────────────────────


def test_line_spacing_detects_double(service):
    pdf = _apa_shaped_pdf(gap_pt=24.0, size=12)  # ratio 2.0
    result = service.analyze(pdf, "apa")  # apa expects double
    check = next(c for c in result["checks"] if c["id"] == "line_spacing")
    assert check["measured"] == "double-spaced"
    assert check["status"] == "pass"


def test_line_spacing_detects_single(service):
    pdf = _apa_shaped_pdf(gap_pt=14.0, size=12)  # ratio ~1.17
    result = service.analyze(pdf, "apa")  # apa expects double -> mismatch
    check = next(c for c in result["checks"] if c["id"] == "line_spacing")
    assert check["measured"] == "single-spaced"
    assert check["status"] == "fail"


def test_line_spacing_single_matches_ieee(service):
    pdf = _apa_shaped_pdf(gap_pt=14.0, size=12, page_number=False)
    result = service.analyze(pdf, "ieee")  # ieee expects single -> match
    check = next(c for c in result["checks"] if c["id"] == "line_spacing")
    assert check["status"] == "pass"


# ── Font ─────────────────────────────────────────────────────────────────


def test_font_detects_times_12_matches_apa(service):
    pdf = _apa_shaped_pdf(font="Times-Roman", size=12)
    result = service.analyze(pdf, "apa")
    check = next(c for c in result["checks"] if c["id"] == "font")
    assert "Times" in check["measured"]
    assert "12" in check["measured"]
    assert check["status"] == "pass"


def test_font_wrong_size_scores_lower(service):
    pdf = _apa_shaped_pdf(font="Times-Roman", size=16)
    result = service.analyze(pdf, "apa")
    check = next(c for c in result["checks"] if c["id"] == "font")
    assert check["score"] < 100


# ── Alignment ────────────────────────────────────────────────────────────


def test_alignment_detects_left_aligned(service):
    pdf = _apa_shaped_pdf(justified=False)
    result = service.analyze(pdf, "apa")  # apa expects left
    check = next(c for c in result["checks"] if c["id"] == "alignment")
    assert check["measured"] == "Left-aligned"
    assert check["status"] == "pass"


def test_alignment_detects_justified(service):
    pdf = _apa_shaped_pdf(justified=True, n_lines=10)
    result = service.analyze(pdf, "ieee")  # ieee expects justified
    check = next(c for c in result["checks"] if c["id"] == "alignment")
    assert check["measured"] == "Justified"
    assert check["status"] == "pass"


def test_alignment_mismatch_scores_low(service):
    pdf = _apa_shaped_pdf(justified=True, n_lines=10)
    result = service.analyze(pdf, "apa")  # apa expects left, got justified
    check = next(c for c in result["checks"] if c["id"] == "alignment")
    assert check["measured"] == "Justified"
    assert check["status"] == "fail"


# ── Page numbers ─────────────────────────────────────────────────────────


def test_page_numbers_detected_top_right(service):
    pdf = _apa_shaped_pdf(page_number=True)
    result = service.analyze(pdf, "apa")
    check = next(c for c in result["checks"] if c["id"] == "page_numbers")
    assert "1/1" in check["measured"]
    assert check["status"] == "pass"


def test_page_numbers_absent_scores_zero(service):
    pdf = _apa_shaped_pdf(page_number=False)
    result = service.analyze(pdf, "apa")
    check = next(c for c in result["checks"] if c["id"] == "page_numbers")
    assert check["score"] == 0.0
    assert check["status"] == "fail"


def test_page_numbers_not_required_for_ieee(service):
    pdf = _apa_shaped_pdf(page_number=False, gap_pt=14.0)
    result = service.analyze(pdf, "ieee")
    check = next(c for c in result["checks"] if c["id"] == "page_numbers")
    assert check["status"] == "pass"
    assert check["expected"] == "Not required"


# ── Multi-page + overall score ──────────────────────────────────────────


def test_multipage_document_analyzes_all_pages(service):
    pdf = _apa_shaped_pdf(pages=3, page_number=True)
    result = service.analyze(pdf, "apa")
    assert result["page_count"] == 3
    check = next(c for c in result["checks"] if c["id"] == "page_numbers")
    assert "3/3" in check["measured"]


def test_well_formatted_apa_document_scores_high(service):
    pdf = _apa_shaped_pdf(margin_in=1.0, font="Times-Roman", size=12, gap_pt=24.0, justified=False, page_number=True)
    result = service.analyze(pdf, "apa")
    assert result["overall_score"] >= 80
    assert result["style_guide"] == "APA (7th ed.)"


def test_badly_formatted_document_scores_low_for_apa(service):
    pdf = _apa_shaped_pdf(
        margin_in=0.4, font="Courier", size=9, gap_pt=11.0, justified=True, page_number=False
    )
    result = service.analyze(pdf, "apa")
    assert result["overall_score"] < 40


# ── Validation ───────────────────────────────────────────────────────────


def test_rejects_unsupported_style(service):
    pdf = _apa_shaped_pdf()
    with pytest.raises(AppError) as exc_info:
        service.analyze(pdf, "chicago")
    assert exc_info.value.code == "UNSUPPORTED_STYLE"


def test_rejects_unreadable_pdf(service):
    with pytest.raises(AppError) as exc_info:
        service.analyze(b"not a pdf at all", "apa")
    assert exc_info.value.code == "UNREADABLE_PDF"


def test_rejects_pdf_with_no_text(service):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.showPage()
    c.save()
    with pytest.raises(AppError) as exc_info:
        service.analyze(buf.getvalue(), "apa")
    assert exc_info.value.code == "NO_TEXT_EXTRACTED"


# ── Paragraph indentation ────────────────────────────────────────────────


def _paragraph_indent_pdf(indent: bool) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.setFont("Times-Roman", 12)
    base_x, indent_x, y = 72, 72 + 36, 720
    for _ in range(6):
        for line_i in range(3):
            x = indent_x if (indent and line_i == 0) else base_x
            c.drawString(x, y, "Careful formatting improves readability for every reader here")
            y -= 24
    c.showPage()
    c.save()
    return buf.getvalue()


def test_paragraph_indent_detected(service):
    pdf = _paragraph_indent_pdf(indent=True)
    result = service.analyze(pdf, "apa")
    check = next(c for c in result["checks"] if c["id"] == "paragraph_indent")
    assert check["status"] == "pass"
    assert "0.5" in check["measured"]


def test_paragraph_indent_absent_fails(service):
    pdf = _paragraph_indent_pdf(indent=False)
    result = service.analyze(pdf, "apa")
    check = next(c for c in result["checks"] if c["id"] == "paragraph_indent")
    assert check["score"] == 0.0
    assert check["status"] == "fail"


def test_paragraph_indent_not_required_for_ieee(service):
    pdf = _paragraph_indent_pdf(indent=False)
    result = service.analyze(pdf, "ieee")
    check = next(c for c in result["checks"] if c["id"] == "paragraph_indent")
    assert check["status"] == "pass"
    assert check["expected"] == "Not required"


# ── Text color ───────────────────────────────────────────────────────────


def _colored_text_pdf(colored: bool) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.setFont("Times-Roman", 12)
    if colored:
        c.setFillColorRGB(0, 0, 1)
    y = 720
    for _ in range(10):
        c.drawString(72, y, "This is a line of body text for color checking purposes today")
        y -= 24
    c.showPage()
    c.save()
    return buf.getvalue()


def test_text_color_black_passes(service):
    pdf = _colored_text_pdf(colored=False)
    result = service.analyze(pdf, "apa")
    check = next(c for c in result["checks"] if c["id"] == "text_color")
    assert check["status"] == "pass"
    assert check["measured"] == "All text is black"


def test_text_color_colored_fails(service):
    pdf = _colored_text_pdf(colored=True)
    result = service.analyze(pdf, "apa")
    check = next(c for c in result["checks"] if c["id"] == "text_color")
    assert check["status"] == "fail"


# ── Font consistency ─────────────────────────────────────────────────────


def _mixed_font_pdf(mixed: bool) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    y = 720
    for i in range(10):
        font = "Helvetica" if (mixed and i % 2 == 0) else "Times-Roman"
        c.setFont(font, 12)
        c.drawString(72, y, "This is a line of body text for font consistency checking today")
        y -= 24
    c.showPage()
    c.save()
    return buf.getvalue()


def test_font_consistency_single_font_passes(service):
    pdf = _mixed_font_pdf(mixed=False)
    result = service.analyze(pdf, "apa")
    check = next(c for c in result["checks"] if c["id"] == "font_consistency")
    assert check["status"] == "pass"
    assert "100%" in check["measured"]


def test_font_consistency_mixed_fonts_fails(service):
    pdf = _mixed_font_pdf(mixed=True)
    result = service.analyze(pdf, "apa")
    check = next(c for c in result["checks"] if c["id"] == "font_consistency")
    assert check["score"] < 70


def test_font_consistency_bold_variant_does_not_count_as_inconsistent(service):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.setFont("Times-Bold", 12)
    c.drawString(72, 720, "Heading One Here")
    c.setFont("Times-Roman", 12)
    y = 696
    for _ in range(9):
        c.drawString(72, y, "This is a line of body text for font consistency checking today")
        y -= 24
    c.showPage()
    c.save()
    result = service.analyze(buf.getvalue(), "apa")
    check = next(c for c in result["checks"] if c["id"] == "font_consistency")
    assert check["status"] == "pass"


# ── Running head ─────────────────────────────────────────────────────────


def _running_head_pdf(with_head: bool) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.setFont("Times-Roman", 10)
    if with_head:
        c.drawString(72, 760, "SHORTENED TITLE HERE")
    c.drawRightString(540, 760, "1")
    c.setFont("Times-Roman", 12)
    y = 700
    for _ in range(8):
        c.drawString(72, y, "This is a line of body text for running head checking today")
        y -= 24
    c.showPage()
    c.save()
    return buf.getvalue()


def test_running_head_detected(service):
    pdf = _running_head_pdf(with_head=True)
    result = service.analyze(pdf, "apa")
    check = next(c for c in result["checks"] if c["id"] == "running_head")
    assert check["status"] == "pass"
    assert check["measured"] == "Detected"


def test_running_head_absent_is_lenient_not_a_hard_fail(service):
    pdf = _running_head_pdf(with_head=False)
    result = service.analyze(pdf, "apa")
    check = next(c for c in result["checks"] if c["id"] == "running_head")
    assert check["measured"] == "Not detected"
    assert check["score"] == 70.0
    assert check["status"] != "fail"


def test_running_head_not_applicable_for_mla(service):
    pdf = _running_head_pdf(with_head=False)
    result = service.analyze(pdf, "mla")
    check = next(c for c in result["checks"] if c["id"] == "running_head")
    assert check["status"] == "pass"
    assert check["expected"] == "Not required"


# ── Fully-compliant document: all 9 checks together ─────────────────────


def test_fully_compliant_apa_document_scores_near_perfect(service):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.setFont("Times-Roman", 10)
    c.drawString(72, 760, "SHORTENED TITLE HERE")
    c.drawRightString(540, 760, "1")
    c.setFont("Times-Roman", 12)
    base_x, indent_x, y = 72, 72 + 36, 720
    full_width = (PAGE_W - 72) - base_x
    idx = 0
    for para in range(8):
        for line_i in range(3):
            x = indent_x if line_i == 0 else base_x
            # Genuinely ragged-right: varying line lengths, like real
            # word-wrapped text — identical repeated text on every line
            # would give zero right-edge variance and misread as justified.
            target = full_width * (0.55 if line_i == 2 else 0.9)
            words, idx = _fill_line(idx, target, "Times-Roman", 12)
            c.drawString(x, y, " ".join(words))
            y -= 24
    # Anchors the bottom-right corner of the text box — see the identical
    # comment on _apa_shaped_pdf's footer line for why this is needed.
    c.setFont("Times-Roman", 10)
    c.drawRightString(PAGE_W - 72, 72, "End of page.")
    c.showPage()
    c.save()

    result = service.analyze(buf.getvalue(), "apa")
    for check in result["checks"]:
        assert check["status"] == "pass", f"{check['id']} unexpectedly {check['status']}: {check['measured']}"
    assert result["overall_score"] >= 95
