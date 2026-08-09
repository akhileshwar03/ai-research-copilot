"""Paper Analyzer — measures a PDF's real layout geometry (margins, line
spacing, font, alignment, page numbering) against a target style guide.

Every check here is computed directly from character-level coordinates
extracted by pdfplumber — never guessed by an LLM. This intentionally holds
a *higher* bar than the AI Checker: these are measurements, not judgment
calls, so there is no heuristic/LLM blend and no confidence hedging beyond
an "unmeasurable" fallback when a page genuinely doesn't have enough text to
measure something reliably (e.g. a mostly-blank page).
"""

import io
import re
import statistics
from collections import Counter
from dataclasses import dataclass

import pdfplumber

from app.core.exceptions import AppError
from app.services.runtime_settings import runtime_settings

POINTS_PER_INCH = 72.0

_FONT_SUBSET_PREFIX = re.compile(r"^[A-Z]{6}\+")
_ROMAN_NUMERAL = re.compile(r"^[ivxlcdm]{1,7}$", re.IGNORECASE)

_STYLE_LABELS = {
    "apa": "APA (7th ed.)",
    "mla": "MLA (9th ed.)",
    "ieee": "IEEE (two-column)",
}


@dataclass(frozen=True)
class StyleRubric:
    margins_in: tuple[float, float, float, float]  # top, bottom, left, right
    margin_tolerance_in: float
    line_spacing: str  # "single" | "1.5" | "double"
    fonts: tuple[tuple[str, float], ...]  # accepted (keyword, size) pairs
    alignment: str  # "left" | "justified"
    page_numbers_required: bool
    page_number_position: str
    two_column: bool
    paragraph_indent_required: bool
    # APA specifically: a short all-caps title in the top-left header,
    # distinct from the page number. Required for professional/publication
    # papers but not student papers — that ambiguity is real, so this check
    # is scored leniently (see _check_running_head), never a hard fail.
    running_head_required: bool


# Margin tolerance is wider than it might look (0.3in, not 0.1-0.15in) on
# purpose: margins are measured from actual character ink (glyph bounding
# boxes), not the nominal "line box" a word processor positions text in. A
# line's first glyph always starts somewhat below the line box's top edge
# (the font's ascent), so even a genuinely-correct 1-inch-margin document
# reads a bit tighter than 1.00in when measured this way — that's a property
# of every real PDF, not just an edge case. The tolerance accounts for that
# expected gap while still catching real misconfiguration (e.g. 0.5in margins
# fail decisively; see test_margins_flags_narrow_margins).
_RUBRICS: dict[str, StyleRubric] = {
    "apa": StyleRubric(
        margins_in=(1.0, 1.0, 1.0, 1.0),
        margin_tolerance_in=0.3,
        line_spacing="double",
        fonts=(("times", 12.0), ("arial", 11.0), ("calibri", 11.0), ("georgia", 11.0)),
        alignment="left",
        page_numbers_required=True,
        page_number_position="top-right",
        two_column=False,
        paragraph_indent_required=True,
        running_head_required=True,
    ),
    "mla": StyleRubric(
        margins_in=(1.0, 1.0, 1.0, 1.0),
        margin_tolerance_in=0.3,
        line_spacing="double",
        fonts=(("times", 12.0), ("arial", 12.0), ("calibri", 12.0), ("georgia", 12.0)),
        alignment="left",
        page_numbers_required=True,
        page_number_position="top-right",
        two_column=False,
        paragraph_indent_required=True,
        running_head_required=False,
    ),
    "ieee": StyleRubric(
        margins_in=(0.75, 1.0, 0.625, 0.625),
        margin_tolerance_in=0.35,
        line_spacing="single",
        fonts=(("times", 10.0), ("times", 9.5), ("times", 9.0)),
        alignment="justified",
        page_numbers_required=False,
        page_number_position="any",
        two_column=True,
        paragraph_indent_required=False,
        running_head_required=False,
    ),
}

_SPACING_ORDER = ["single", "1.5", "double"]


# ── Pure geometry helpers ────────────────────────────────────────────────


def _normalize_font(name: str) -> str:
    return _FONT_SUBSET_PREFIX.sub("", name or "").lower()


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * p
    f = int(k)
    c = min(f + 1, len(s) - 1)
    if f == c:
        return s[f]
    return s[f] + (s[c] - s[f]) * (k - f)


def _summarize_line(chars: list[dict], col: int) -> dict:
    sizes = [c["size"] for c in chars if c.get("size")]
    fonts = [_normalize_font(c.get("fontname", "")) for c in chars]
    text = "".join(c.get("text", "") for c in chars)
    return {
        "col": col,
        "top": statistics.mean(c["top"] for c in chars),
        "bottom": statistics.mean(c["bottom"] for c in chars),
        "x0": min(c["x0"] for c in chars),
        "x1": max(c["x1"] for c in chars),
        "size": statistics.median(sizes) if sizes else 0.0,
        "text": text.strip(),
    }


def _split_row_into_lines(row_chars: list[dict], col: int) -> list[dict]:
    """A vertical "row" cluster (chars at the same height) can still
    contain two horizontally distant, unrelated pieces of text — most
    commonly a header's running head (left) and page number (right) on the
    same baseline. Left ungrouped, they'd concatenate into one nonsensical
    line (e.g. "SHORTENED TITLE HERE1"), silently breaking page-number
    detection on any document that also has a running head. Splitting on a
    large horizontal gap (far bigger than a normal word-space) fixes this
    without affecting ordinary body text, where gaps between words are only
    a few points."""
    ordered = sorted(row_chars, key=lambda c: c["x0"])
    segments: list[list[dict]] = [[ordered[0]]]
    for c in ordered[1:]:
        prev = segments[-1][-1]
        gap = c["x0"] - prev["x1"]
        gap_threshold = max(24.0, (prev.get("size") or 12.0) * 2.5)
        if gap > gap_threshold:
            segments.append([c])
        else:
            segments[-1].append(c)
    return [_summarize_line(seg, col) for seg in segments]


def _group_lines(chars: list[dict], two_column: bool, page_width: float) -> list[dict]:
    """Cluster characters into visual lines by vertical position, then
    split each vertical cluster on large horizontal gaps (see
    _split_row_into_lines). For two-column layouts, chars are first split
    by which half of the page they fall in — without this, lines from both
    columns at the same vertical position would be merged into one
    nonsensical "line", and line-spacing/alignment stats would be corrupted
    for exactly the style guide (IEEE) that most needs column-awareness."""
    if not chars:
        return []

    def _column(c: dict) -> int:
        if not two_column:
            return 0
        return 0 if c["x0"] < page_width / 2 else 1

    buckets: dict[int, list[dict]] = {0: [], 1: []}
    for c in chars:
        buckets[_column(c)].append(c)

    lines: list[dict] = []
    for col, col_chars in buckets.items():
        if not col_chars:
            continue
        col_chars = sorted(col_chars, key=lambda c: c["top"])
        current = [col_chars[0]]
        for c in col_chars[1:]:
            ref_size = current[-1]["size"] or 1.0
            if abs(c["top"] - current[-1]["top"]) <= max(ref_size * 0.35, 1.0):
                current.append(c)
            else:
                lines.extend(_split_row_into_lines(current, col))
                current = [c]
        lines.extend(_split_row_into_lines(current, col))
    return sorted(lines, key=lambda ln: (ln["col"], ln["top"]))


def _page_margins_in(lines: list[dict], page_width: float, page_height: float) -> tuple[float, float, float, float]:
    """Margins are measured per *line*, not per character, and the caller
    excludes any line already identified as a page number before calling
    this — a page number legitimately lives inside the nominal margin zone
    in real APA/MLA/IEEE formatting (that's the whole point of a header/
    footer area), so it must not be counted as part of the body's own
    top/bottom extent, or a *correctly* placed page number would make a
    perfectly-margined page read as having almost no top margin at all.

    A line's top/bottom/left/right extent is really one data point ("does
    this line reach the margin?"), but pooling raw characters gives every
    *interior* character of a line its own vote too — for a long line, only
    the single first/last character actually reflects the line's true
    extent. That dilution was a real, confirmed bug for left/right: a short
    footer line got outvoted by the dozens of *interior* characters in
    ordinary body lines, so pages with real, correctly-flush content still
    measured as having much wider margins than they actually do. Aggregating
    at the line level first (via _group_lines/_summarize_line) fixes this
    uniformly for all four sides."""
    tops = [ln["top"] for ln in lines]
    bottoms = [ln["bottom"] for ln in lines]
    x0s = [ln["x0"] for ln in lines]
    x1s = [ln["x1"] for ln in lines]
    top_margin = max(min(tops), 0.0)
    bottom_margin = max(page_height - max(bottoms), 0.0)
    left_margin = max(min(x0s), 0.0)
    right_margin = max(page_width - max(x1s), 0.0)
    return (
        top_margin / POINTS_PER_INCH,
        bottom_margin / POINTS_PER_INCH,
        left_margin / POINTS_PER_INCH,
        right_margin / POINTS_PER_INCH,
    )


def _line_spacing_ratio(lines: list[dict]) -> float | None:
    by_col: dict[int, list[dict]] = {}
    for ln in lines:
        by_col.setdefault(ln["col"], []).append(ln)

    deltas: list[float] = []
    sizes: list[float] = []
    for col_lines in by_col.values():
        col_lines = sorted(col_lines, key=lambda ln: ln["top"])
        for prev, cur in zip(col_lines, col_lines[1:]):
            gap = cur["top"] - prev["top"]
            if gap <= 0:
                continue
            deltas.append(gap)
            sizes.append(cur["size"] or prev["size"])

    if len(deltas) < 2:
        return None

    # Mode (not mean) of rounded deltas, so paragraph-break/heading gaps
    # (much larger than the true within-paragraph line spacing) don't skew
    # the result — the most common gap is the real line spacing.
    rounded = [round(d) for d in deltas]
    common_delta, _ = Counter(rounded).most_common(1)[0]
    common_size = statistics.median([s for s in sizes if s]) or 12.0
    return common_delta / common_size


def _classify_spacing(ratio: float | None) -> str:
    if ratio is None:
        return "unknown"
    if ratio < 1.35:
        return "single"
    if ratio < 1.75:
        return "1.5"
    return "double"


def _dominant_font(chars: list[dict]) -> tuple[str, float]:
    counter: Counter = Counter()
    for c in chars:
        name = _normalize_font(c.get("fontname", ""))
        size = round(c.get("size") or 0.0, 1)
        if name and size:
            counter[(name, size)] += 1
    if not counter:
        return ("", 0.0)
    return counter.most_common(1)[0][0]


_STYLE_SUFFIX = re.compile(r"[-,]?\s*(bold|italic|oblique|regular)\b", re.IGNORECASE)


def _font_family(name: str) -> str:
    """Strips weight/style suffixes so 'Times-Bold' and 'Times-Roman' group
    as the same family — a document using its body font's bold variant for
    headings is normal, correct formatting, not font inconsistency."""
    return _STYLE_SUFFIX.sub("", name).strip(" -,").lower()


def _font_consistency(chars: list[dict]) -> tuple[str, float]:
    counter: Counter = Counter()
    for c in chars:
        fam = _font_family(_normalize_font(c.get("fontname", "")))
        if fam:
            counter[fam] += 1
    if not counter:
        return ("", 1.0)
    total = sum(counter.values())
    fam, count = counter.most_common(1)[0]
    return (fam, count / total)


def _is_near_black(color) -> bool:
    """Handles the PDF color spaces pdfplumber actually returns: a bare
    float (DeviceGray), an RGB triple, a CMYK quadruple, or None (no color
    set, which PDF defaults to black)."""
    if color is None:
        return True
    if isinstance(color, (int, float)):
        return color <= 0.15
    if isinstance(color, (list, tuple)) and color:
        if len(color) >= 4:
            c, m, y, _k = color[:4]
            return (c + m + y) <= 0.3
        return max(color[:3]) <= 0.15
    return True


def _text_color_black_ratio(chars: list[dict]) -> float:
    if not chars:
        return 1.0
    black = sum(1 for c in chars if _is_near_black(c.get("non_stroking_color")))
    return black / len(chars)


def _measure_paragraph_indent(lines: list[dict]) -> tuple[float, float]:
    """Returns (indent_ratio, median_indent_pt). A paragraph's first line is
    detectable as one whose left edge sits ~0.3-0.75in right of the page's
    dominant (most common) left margin — there's no reliable blank-line gap
    to find paragraph breaks in double-spaced text, since normal within-
    paragraph and between-paragraph spacing are identical there; indent
    offset is the only available signal."""
    body_lines = [ln for ln in lines if len(ln["text"]) > 3]
    if len(body_lines) < 4:
        return (0.0, 0.0)
    base_x0, _ = Counter(round(ln["x0"]) for ln in body_lines).most_common(1)[0]
    indented = [ln["x0"] - base_x0 for ln in body_lines if 20 <= (ln["x0"] - base_x0) <= 54]
    if not indented:
        return (0.0, 0.0)
    return (len(indented) / len(body_lines), statistics.median(indented))


def _detect_running_head(lines: list[dict], page_width: float, page_height: float) -> dict | None:
    """A short, mostly-uppercase line in the top-left/top-center header
    band — distinct from the page number (top-right), which the caller
    excludes separately. Returns the matched line (not just a bool) so it
    can also be excluded from body-margin measurement: like a page number,
    a running head legitimately lives inside the nominal margin zone, so
    counting it as body content would make a correctly-formatted page read
    as having almost no top margin — the same bug page numbers caused
    before they were excluded, just for a second kind of header content."""
    top_band = page_height * 0.08
    for ln in lines:
        text = ln["text"].strip()
        if not (3 <= len(text) <= 60) or ln["top"] > top_band:
            continue
        letters = [ch for ch in text if ch.isalpha()]
        if not letters or sum(1 for ch in letters if ch.isupper()) / len(letters) < 0.8:
            continue
        center = (ln["x0"] + ln["x1"]) / 2
        if center > page_width * 2 / 3:
            continue  # that's the page-number zone, not the running head
        return ln
    return None


def _classify_alignment(lines: list[dict]) -> str:
    by_col: dict[int, list[dict]] = {}
    for ln in lines:
        by_col.setdefault(ln["col"], []).append(ln)

    votes: list[str] = []
    for col_lines in by_col.values():
        body_lines = [ln for ln in col_lines if len(ln["text"]) > 15]
        if len(body_lines) < 4:
            continue
        # Indented first-of-paragraph lines are a separate, legitimate
        # signal (see _measure_paragraph_indent) — pooling them in with
        # continuation lines would make any correctly-indented APA/MLA
        # document's left edge look inconsistent and unmeasurable. Use the
        # majority left-edge cluster (the continuation-line margin) instead
        # of every body line.
        base_x0, _ = Counter(round(ln["x0"]) for ln in body_lines).most_common(1)[0]
        aligned_lines = [ln for ln in body_lines if abs(ln["x0"] - base_x0) <= 8]
        if len(aligned_lines) < 4:
            continue
        right_edges = [ln["x1"] for ln in aligned_lines]
        right_boundary = _percentile(right_edges, 0.85)
        near_right = [x for x in right_edges if abs(x - right_boundary) <= 10]
        right_fraction = len(near_right) / len(aligned_lines)
        votes.append("justified" if right_fraction >= 0.55 else "left")

    if not votes:
        return "unknown"
    return Counter(votes).most_common(1)[0][0]


def _detect_page_number(lines: list[dict], page_width: float, page_height: float) -> tuple[bool, str, dict | None]:
    top_band = page_height * 0.08
    bottom_band = page_height * 0.92
    for ln in lines:
        text = ln["text"].strip()
        if not text or len(text) > 6:
            continue
        if not (text.isdigit() or bool(_ROMAN_NUMERAL.match(text))):
            continue
        if ln["top"] <= top_band:
            zone = "top"
        elif ln["top"] >= bottom_band:
            zone = "bottom"
        else:
            continue
        center = (ln["x0"] + ln["x1"]) / 2
        if center < page_width / 3:
            side = "left"
        elif center > page_width * 2 / 3:
            side = "right"
        else:
            side = "center"
        return True, f"{zone}-{side}", ln
    return False, "", None


def _score_from_deviation(deviation: float, tolerance: float) -> float:
    if tolerance <= 0:
        return 100.0 if deviation == 0 else 0.0
    score = 100.0 * (1 - deviation / (tolerance * 1.5))
    return max(0.0, min(100.0, score))


def _status_from_score(score: float) -> str:
    if score >= 85:
        return "pass"
    if score >= 50:
        return "warning"
    return "fail"


def _unmeasurable(check_id: str, label: str) -> dict:
    return {
        "id": check_id,
        "label": label,
        "status": "warning",
        "score": 50.0,
        "measured": "Could not be measured",
        "expected": "—",
        "explanation": "Not enough text was detected to measure this reliably.",
    }


# ── Service ───────────────────────────────────────────────────────────────


class PaperAnalyzerService:
    """Stateless — every check is pure computation, no LLM/API dependency."""

    def analyze(self, pdf_bytes: bytes, style: str) -> dict:
        style = (style or "").lower().strip()
        if style not in _RUBRICS:
            raise AppError(
                code="UNSUPPORTED_STYLE",
                message=f"Unsupported style guide: '{style}'. Choose apa, mla, or ieee.",
                status_code=400,
            )
        rubric = _RUBRICS[style]

        try:
            pdf = pdfplumber.open(io.BytesIO(pdf_bytes))
        except Exception as exc:
            raise AppError(code="UNREADABLE_PDF", message="Could not read this PDF file", status_code=422) from exc

        try:
            pages = pdf.pages
            if not pages:
                raise AppError(code="EMPTY_PDF", message="This PDF has no pages", status_code=422)

            max_pages = int(runtime_settings.get("paper_analyzer_max_pages"))
            if len(pages) > max_pages:
                raise AppError(
                    code="TOO_MANY_PAGES",
                    message=f"This document has {len(pages)} pages; the limit is {max_pages}",
                    status_code=413,
                )

            per_page_margins: list[tuple[float, float, float, float]] = []
            all_lines: list[dict] = []
            all_chars: list[dict] = []
            page_number_positions: list[str] = []
            page_number_lines: list[dict] = []
            page_number_found = 0
            running_head_found = 0

            for page in pages:
                chars = page.chars
                if not chars:
                    continue
                all_chars.extend(chars)
                lines = _group_lines(chars, rubric.two_column, page.width)
                found, position, page_number_line = _detect_page_number(lines, page.width, page.height)
                running_head_line = _detect_running_head(lines, page.width, page.height)
                # Header-zone content (page number, running head) is excluded
                # from body-margin measurement regardless of style — it
                # legitimately lives inside the nominal margin, on every
                # style guide, not just APA where the running-head check
                # itself is scored.
                header_lines = {id(page_number_line), id(running_head_line)}
                margin_lines = [ln for ln in lines if id(ln) not in header_lines]
                per_page_margins.append(_page_margins_in(margin_lines, page.width, page.height))
                all_lines.extend(lines)
                if found:
                    page_number_found += 1
                    page_number_positions.append(position)
                    page_number_lines.append(page_number_line)
                if running_head_line is not None:
                    running_head_found += 1

            page_count = len(pages)
        finally:
            pdf.close()

        if not all_chars:
            raise AppError(
                code="NO_TEXT_EXTRACTED",
                message="This document has no extractable text (it may be a scanned image) — OCR isn't supported yet",
                status_code=422,
            )

        checks = [
            self._check_margins(per_page_margins, rubric),
            self._check_line_spacing(all_lines, rubric),
            self._check_font(all_chars, rubric),
            self._check_alignment(all_lines, rubric),
            self._check_page_numbers(page_count, page_number_found, page_number_positions, rubric),
            self._check_paragraph_indent(all_lines, rubric),
            self._check_text_color(all_chars),
            self._check_font_consistency(all_chars),
            self._check_running_head(running_head_found, page_count, rubric),
        ]
        overall_score = round(statistics.mean(c["score"] for c in checks), 1)
        style_label = _STYLE_LABELS[style]

        return {
            "style_guide": style_label,
            "overall_score": overall_score,
            "page_count": page_count,
            "checks": checks,
            "disclaimer": (
                "Checks core structural formatting — margins, spacing, font, alignment, page "
                "numbering, paragraph indentation, text color, and font consistency — against "
                f"commonly published {style_label} guidelines. It does not check citation "
                "formatting, content quality, or every clause of the guide, and specific "
                "publishers or institutions may require variations. Always confirm against your "
                "target's exact requirements before submitting."
            ),
        }

    def _check_margins(self, per_page_margins: list[tuple[float, float, float, float]], rubric: StyleRubric) -> dict:
        if not per_page_margins:
            return _unmeasurable("margins", "Margins")
        sides = ["top", "bottom", "left", "right"]
        medians = [statistics.median(m[i] for m in per_page_margins) for i in range(4)]
        deviations = [abs(medians[i] - rubric.margins_in[i]) for i in range(4)]
        scores = [_score_from_deviation(d, rubric.margin_tolerance_in) for d in deviations]
        score = round(statistics.mean(scores), 1)
        measured = ", ".join(f"{sides[i]} {medians[i]:.2f}\"" for i in range(4))
        expected = ", ".join(f"{sides[i]} {rubric.margins_in[i]:.2f}\"" for i in range(4))
        inconsistent = any(
            (max(m[i] for m in per_page_margins) - min(m[i] for m in per_page_margins)) >= 0.3 for i in range(4)
        )
        note = " Margins vary noticeably across pages." if inconsistent else ""
        return {
            "id": "margins",
            "label": "Margins",
            "status": _status_from_score(score),
            "score": score,
            "measured": measured,
            "expected": expected,
            "explanation": f"Measured the body-text bounding box on every page against the target margins.{note}",
        }

    def _check_line_spacing(self, all_lines: list[dict], rubric: StyleRubric) -> dict:
        ratio = _line_spacing_ratio(all_lines)
        detected = _classify_spacing(ratio)
        if detected == "unknown":
            return _unmeasurable("line_spacing", "Line spacing")
        distance = abs(_SPACING_ORDER.index(detected) - _SPACING_ORDER.index(rubric.line_spacing))
        score = 100.0 if distance == 0 else (50.0 if distance == 1 else 10.0)
        return {
            "id": "line_spacing",
            "label": "Line spacing",
            "status": _status_from_score(score),
            "score": score,
            "measured": f"{detected}-spaced",
            "expected": f"{rubric.line_spacing}-spaced",
            "explanation": (
                f"Line-to-line spacing is about {ratio:.2f}x the body font size." if ratio else ""
            ),
        }

    def _check_font(self, all_chars: list[dict], rubric: StyleRubric) -> dict:
        name, size = _dominant_font(all_chars)
        if not name:
            return _unmeasurable("font", "Font")
        keyword_match = next((kw for kw, _ in rubric.fonts if kw in name), None)
        size_match = keyword_match is not None and any(
            kw == keyword_match and abs(sz - size) <= 0.5 for kw, sz in rubric.fonts
        )
        if keyword_match and size_match:
            score = 100.0
        elif keyword_match:
            score = 65.0
        else:
            score = 30.0
        expected = " or ".join(f"{kw.title()} {sz:g}pt" for kw, sz in rubric.fonts)
        return {
            "id": "font",
            "label": "Font",
            "status": _status_from_score(score),
            "score": score,
            "measured": f"{name.title()} {size:g}pt",
            "expected": expected,
            "explanation": "Checked the most common body-text font and size against the style guide's accepted list.",
        }

    def _check_alignment(self, all_lines: list[dict], rubric: StyleRubric) -> dict:
        detected = _classify_alignment(all_lines)
        if detected == "unknown":
            return _unmeasurable("alignment", "Alignment")
        score = 100.0 if detected == rubric.alignment else 20.0
        label = {"justified": "Justified", "left": "Left-aligned"}
        return {
            "id": "alignment",
            "label": "Alignment",
            "status": _status_from_score(score),
            "score": score,
            "measured": label[detected],
            "expected": label[rubric.alignment],
            "explanation": "Compared how consistently each line's edges reach the measured margins.",
        }

    def _check_page_numbers(
        self, page_count: int, found_count: int, positions: list[str], rubric: StyleRubric
    ) -> dict:
        if not rubric.page_numbers_required:
            return {
                "id": "page_numbers",
                "label": "Page numbering",
                "status": "pass",
                "score": 100.0,
                "measured": f"{found_count}/{page_count} pages numbered",
                "expected": "Not required",
                "explanation": "This style guide doesn't require page numbers on every page.",
            }
        fraction = found_count / page_count if page_count else 0.0
        position_credit = 0.5
        common_position = ""
        if positions:
            common_position, _ = Counter(positions).most_common(1)[0]
            position_credit = 1.0 if rubric.page_number_position in common_position else 0.6
        score = round(100.0 * fraction * (0.5 + 0.5 * position_credit), 1)
        measured = f"{found_count}/{page_count} pages numbered"
        if common_position:
            measured += f", mostly {common_position}"
        return {
            "id": "page_numbers",
            "label": "Page numbering",
            "status": _status_from_score(score),
            "score": score,
            "measured": measured,
            "expected": f"Every page, {rubric.page_number_position}",
            "explanation": "Looked for an isolated page-number-like token near the top or bottom of each page.",
        }

    def _check_paragraph_indent(self, all_lines: list[dict], rubric: StyleRubric) -> dict:
        indent_ratio, median_indent_pt = _measure_paragraph_indent(all_lines)
        if not rubric.paragraph_indent_required:
            return {
                "id": "paragraph_indent",
                "label": "Paragraph indentation",
                "status": "pass",
                "score": 100.0,
                "measured": f"{round(indent_ratio * 100)}% of lines indented" if indent_ratio else "No first-line indent detected",
                "expected": "Not required",
                "explanation": "This style guide doesn't require a first-line paragraph indent.",
            }
        if indent_ratio == 0:
            score = 0.0
        else:
            deviation_in = abs(median_indent_pt / POINTS_PER_INCH - 0.5)
            score = _score_from_deviation(deviation_in, 0.2)
        measured = (
            f"~{median_indent_pt / POINTS_PER_INCH:.2f}\" indent on {round(indent_ratio * 100)}% of lines"
            if indent_ratio
            else "No first-line indent detected"
        )
        return {
            "id": "paragraph_indent",
            "label": "Paragraph indentation",
            "status": _status_from_score(score),
            "score": score,
            "measured": measured,
            "expected": "0.5\" first-line indent on paragraphs",
            "explanation": "Checked whether paragraph-starting lines sit right of the page's normal left margin.",
        }

    def _check_text_color(self, all_chars: list[dict]) -> dict:
        black_ratio = _text_color_black_ratio(all_chars)
        if black_ratio >= 0.97:
            score = 100.0
        elif black_ratio >= 0.85:
            score = 60.0
        else:
            score = 15.0
        return {
            "id": "text_color",
            "label": "Text color",
            "status": _status_from_score(score),
            "score": score,
            "measured": "All text is black" if black_ratio >= 0.99 else f"{round(black_ratio * 100)}% black text",
            "expected": "Black body text",
            "explanation": "Checked whether the document's text uses plain black rather than colored fonts.",
        }

    def _check_font_consistency(self, all_chars: list[dict]) -> dict:
        family, share = _font_consistency(all_chars)
        if not family:
            return _unmeasurable("font_consistency", "Font consistency")
        if share >= 0.9:
            score = 100.0
        elif share >= 0.75:
            score = 70.0
        elif share >= 0.5:
            score = 40.0
        else:
            score = 15.0
        other_pct = round((1 - share) * 100)
        measured = f"{round(share * 100)}% {family.title()}" + (f", {other_pct}% other fonts" if other_pct else "")
        return {
            "id": "font_consistency",
            "label": "Font consistency",
            "status": _status_from_score(score),
            "score": score,
            "measured": measured,
            "expected": "One consistent body font family throughout",
            "explanation": (
                "Checked whether the document uses a single font family consistently "
                "(bold/italic variants of the same family don't count against it)."
            ),
        }

    def _check_running_head(self, running_head_found: int, page_count: int, rubric: StyleRubric) -> dict:
        if not rubric.running_head_required:
            return {
                "id": "running_head",
                "label": "Running head",
                "status": "pass",
                "score": 100.0,
                "measured": "Not checked",
                "expected": "Not required",
                "explanation": "This style guide doesn't use a separate running head.",
            }
        found = running_head_found > 0 and running_head_found >= page_count / 2
        # Lenient on purpose: APA requires a running head for professional/
        # publication papers, but student papers (this tool's likely main
        # audience) commonly and correctly omit it — so absence is a mild
        # warning, never a hard fail, and presence is simply full credit.
        score = 100.0 if found else 70.0
        return {
            "id": "running_head",
            "label": "Running head",
            "status": _status_from_score(score),
            "score": score,
            "measured": "Detected" if found else "Not detected",
            "expected": "Short all-caps title, top-left (required for professional papers; optional for student papers)",
            "explanation": "APA professional papers use a running head; student papers often correctly omit it, so this isn't scored harshly.",
        }
