"""Admin PDF report: a narrative, chart-rich operations report for a UTC date range.

`collect_report_data` gathers everything from the database; `build_report_pdf`
turns it into a paginated document (cover, contents, summary, charts, tables,
appendices). Charts are vector drawings (see admin_report_charts).
"""

import io
from datetime import date, datetime, timezone
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models.admin_audit_log import AdminAuditLog
from app.db.models.usage_event import UsageEvent
from app.db.models.user import User
from app.services import admin_report_charts as charts
from app.services.admin_analytics import compute_analytics, day_bounds, document_summary, previous_range, resolve_user
from app.services.runtime_settings import runtime_settings
from app.services.usage_tracking import TOOL_LABELS

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

INK = charts.INK
MUTED = charts.MUTED
BRAND = charts.BRAND
RULE = colors.HexColor("#e6dccd")
SOFT = colors.HexColor("#faf5ee")
GOOD = colors.HexColor("#1f7a4d")
BAD = colors.HexColor("#b4183c")
WARN = colors.HexColor("#b4530f")

TOOL_SWITCHES = [
    ("Research Copilot", "tool_research_copilot_enabled"),
    ("Humanizer", "tool_humanizer_enabled"),
    ("AI Checker", "tool_checker_enabled"),
    ("Real-time AI", "tool_realtime_enabled"),
    ("Paper Analyzer", "tool_paper_analyzer_enabled"),
    ("Text extraction", "tool_extract_enabled"),
]


# ── Data collection ────────────────────────────────────────────────────────────

def collect_report_data(db: Session, start: date, end: date, user_id: int | None, generated_by: str) -> dict:
    user_email = resolve_user(db, user_id)
    previous_start, previous_end = previous_range(start, end)
    current = compute_analytics(db, start, end, user_id, user_email)
    previous = compute_analytics(db, previous_start, previous_end, user_id, user_email)

    days = (end - start).days + 1
    since, until = day_bounds(start, days)
    event_filters = [UsageEvent.created_at >= since, UsageEvent.created_at < until]
    if user_id is not None:
        event_filters.append(UsageEvent.user_id == user_id)

    error_codes = [
        (int(code), int(n))
        for code, n in db.query(UsageEvent.status_code, func.count(UsageEvent.id))
        .filter(*event_filters, UsageEvent.ok.is_(False))
        .group_by(UsageEvent.status_code)
        .order_by(func.count(UsageEvent.id).desc())
        .limit(8)
        .all()
    ]

    slow_rows = (
        db.query(UsageEvent.created_at, UsageEvent.tool, UsageEvent.duration_ms, UsageEvent.status_code, User.email)
        .outerjoin(User, User.id == UsageEvent.user_id)
        .filter(*event_filters)
        .order_by(UsageEvent.duration_ms.desc())
        .limit(6)
        .all()
    )
    slow_requests = [
        {
            "at": created,
            "tool": tool,
            "duration_ms": int(duration or 0),
            "status": int(status),
            "user": email or "anonymous",
        }
        for created, tool, duration, status, email in slow_rows
    ]

    accounts = None
    admin_actions = None
    if user_id is None:
        accounts = {
            "total": int(db.query(func.count(User.id)).scalar() or 0),
            "active": int(db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0),
            "suspended": int(db.query(func.count(User.id)).filter(User.is_active.is_(False)).scalar() or 0),
            "admins": int(db.query(func.count(User.id)).filter(User.is_admin.is_(True)).scalar() or 0),
            "verified": int(db.query(func.count(User.id)).filter(User.email_verified.is_(True)).scalar() or 0),
        }
        audit_filters = [AdminAuditLog.created_at >= since, AdminAuditLog.created_at < until]
        admin_actions = {
            "counts": [
                (action, int(n))
                for action, n in db.query(AdminAuditLog.action, func.count(AdminAuditLog.id))
                .filter(*audit_filters)
                .group_by(AdminAuditLog.action)
                .order_by(func.count(AdminAuditLog.id).desc())
                .limit(8)
                .all()
            ],
            "recent": [
                {"at": row.created_at, "admin": row.admin_email, "action": row.action, "target": row.target or ""}
                for row in db.query(AdminAuditLog)
                .filter(*audit_filters)
                .order_by(AdminAuditLog.created_at.desc())
                .limit(12)
                .all()
            ],
            "total": int(db.query(func.count(AdminAuditLog.id)).filter(*audit_filters).scalar() or 0),
        }

    return {
        "start": start,
        "end": end,
        "previous_start": previous_start,
        "previous_end": previous_end,
        "days": days,
        "user_id": user_id,
        "user_email": user_email,
        "generated_at": datetime.now(timezone.utc),
        "generated_by": generated_by,
        "current": current,
        "previous": previous,
        "error_codes": error_codes,
        "slow_requests": slow_requests,
        "documents": document_summary(db, user_email),
        "accounts": accounts,
        "admin_actions": admin_actions,
        "switches": {
            "maintenance": bool(runtime_settings.get("maintenance_mode")),
            "signups": bool(runtime_settings.get("signups_enabled")),
            "tools": [(label, bool(runtime_settings.get(key))) for label, key in TOOL_SWITCHES],
        },
    }


def report_filename(start: date, end: date, user_id: int | None) -> str:
    scope = f"-user-{user_id}" if user_id is not None else ""
    return f"querex-report-{start.isoformat()}_to_{end.isoformat()}{scope}.pdf"


# ── Formatting helpers ─────────────────────────────────────────────────────────

def esc(value: object) -> str:
    return escape(charts.safe(value))


def fmt_int(value: float) -> str:
    return f"{int(round(value)):,}"


def fmt_ms(ms: float) -> str:
    if ms >= 120_000:
        return f"{ms / 60_000:.1f} min"
    if ms >= 1000:
        return f"{ms / 1000:.1f} s"
    return f"{int(ms)} ms"


def fmt_bytes(value: float) -> str:
    size = float(value)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def fmt_day(day: str) -> str:
    return datetime.fromisoformat(day).strftime("%b %d").replace(" 0", " ")


def fmt_stamp(value: datetime | None) -> str:
    if value is None:
        return "-"
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc)
    return value.strftime("%Y-%m-%d %H:%M")


def pct(numerator: float, denominator: float) -> float:
    return numerator / denominator * 100 if denominator else 0.0


def change(current: float, previous: float) -> tuple[str, colors.Color | None, int]:
    """Text, color (neutral = None) and direction (-1/0/1) of a period-over-period change."""
    if current == previous:
        return "no change", MUTED, 0
    if previous == 0:
        return "new activity", None, 1
    delta = (current - previous) / previous * 100
    sign = "+" if delta > 0 else ""
    return f"{sign}{delta:.1f}% vs prior", None, 1 if delta > 0 else -1


def sums(series: list[dict], key: str) -> int:
    return sum(day[key] for day in series)


# ── Styles ─────────────────────────────────────────────────────────────────────

def make_styles() -> dict[str, ParagraphStyle]:
    base = dict(fontName="Helvetica", textColor=INK, leading=13.5, fontSize=9.5)
    return {
        "body": ParagraphStyle("body", spaceAfter=6, **base),
        "small": ParagraphStyle("small", **{**base, "fontSize": 8, "leading": 11, "textColor": MUTED}),
        "caption": ParagraphStyle("caption", **{**base, "fontSize": 8, "leading": 10.5, "textColor": MUTED}, spaceAfter=10),
        "h1": ParagraphStyle(
            "H1", **{**base, "fontName": "Helvetica-Bold", "fontSize": 17, "leading": 21, "textColor": INK},
            spaceBefore=14, spaceAfter=4,
        ),
        "h2": ParagraphStyle(
            "H2", **{**base, "fontName": "Helvetica-Bold", "fontSize": 11.5, "leading": 15}, spaceBefore=10, spaceAfter=4
        ),
        "cell": ParagraphStyle("cell", **{**base, "fontSize": 8.2, "leading": 10.5}),
        "cell_right": ParagraphStyle("cell_right", **{**base, "fontSize": 8.2, "leading": 10.5}, alignment=TA_RIGHT),
        "cell_head": ParagraphStyle(
            "cell_head", **{**base, "fontName": "Helvetica-Bold", "fontSize": 7.6, "leading": 9.5, "textColor": colors.white}
        ),
        "cell_head_right": ParagraphStyle(
            "cell_head_right",
            **{**base, "fontName": "Helvetica-Bold", "fontSize": 7.6, "leading": 9.5, "textColor": colors.white},
            alignment=TA_RIGHT,
        ),
        "kpi_label": ParagraphStyle("kpi_label", **{**base, "fontSize": 7.4, "leading": 9, "textColor": MUTED}),
        "kpi_value": ParagraphStyle(
            "kpi_value", **{**base, "fontName": "Helvetica-Bold", "fontSize": 18, "leading": 22}
        ),
        "kpi_note": ParagraphStyle("kpi_note", **{**base, "fontSize": 7.4, "leading": 9}),
        "contents_title": ParagraphStyle(
            "ContentsTitle", **{**base, "fontName": "Helvetica-Bold", "fontSize": 17, "leading": 21}, spaceBefore=14, spaceAfter=4
        ),
    }


# ── Reusable flowables ─────────────────────────────────────────────────────────

def kpi_grid(cards: list[tuple[str, str, str, colors.Color]], columns: int, styles: dict) -> Table:
    """cards: (label, value, note, note_color)."""
    cells = []
    for label, value, note, note_color in cards:
        cells.append(
            [
                Paragraph(esc(label.upper()), styles["kpi_label"]),
                Paragraph(esc(value), styles["kpi_value"]),
                Paragraph(f'<font color="{note_color.hexval().replace("0x", "#")}">{esc(note)}</font>', styles["kpi_note"]),
            ]
        )
    rows = [cells[i : i + columns] for i in range(0, len(cells), columns)]
    for row in rows:
        while len(row) < columns:
            row.append("")
    gap = 5
    col_w = (CONTENT_W - gap * (columns - 1)) / columns
    table = Table(rows, colWidths=[col_w] * columns, hAlign="LEFT")
    style = [("VALIGN", (0, 0), (-1, -1), "TOP")]
    for r, row in enumerate(rows):
        for c, cell in enumerate(row):
            if cell != "":
                style += [
                    ("BACKGROUND", (c, r), (c, r), SOFT),
                    ("BOX", (c, r), (c, r), 0.6, RULE),
                    ("LINEABOVE", (c, r), (c, r), 2, BRAND),
                    ("LEFTPADDING", (c, r), (c, r), 8),
                    ("RIGHTPADDING", (c, r), (c, r), 6),
                    ("TOPPADDING", (c, r), (c, r), 6),
                    ("BOTTOMPADDING", (c, r), (c, r), 7),
                ]
    style.append(("BOTTOMPADDING", (0, 0), (-1, -1), 7))
    table.setStyle(TableStyle(style))
    return table


def data_table(
    headers: list[str],
    rows: list[list[str]],
    col_widths: list[float],
    styles: dict,
    right_from: int = 1,
    compact: bool = False,
) -> Table:
    head = [
        Paragraph(esc(h), styles["cell_head_right" if i >= right_from else "cell_head"]) for i, h in enumerate(headers)
    ]
    body = [
        [Paragraph(esc(c), styles["cell_right" if i >= right_from else "cell"]) for i, c in enumerate(row)] for row in rows
    ]
    table = Table([head] + body, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    pad = 2 if compact else 4
    side = 3 if compact else 5
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), INK),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
                ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), pad),
                ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
                ("LEFTPADDING", (0, 0), (-1, -1), side),
                ("RIGHTPADDING", (0, 0), (-1, -1), side),
            ]
        )
    )
    return table


def section(title: str, styles: dict, intro: str | None = None) -> list:
    out = [CondPageBreak(85 * mm), Paragraph(esc(title), styles["h1"])]
    rule = Table([[""]], colWidths=[CONTENT_W], rowHeights=[2])
    rule.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1.2, BRAND)]))
    out += [rule, Spacer(1, 6)]
    if intro:
        out.append(Paragraph(intro, styles["body"]))
    return out


def figure(drawing, caption: str, styles: dict) -> KeepTogether:
    return KeepTogether([drawing, Paragraph(esc(caption), styles["caption"])])


# ── Narrative ──────────────────────────────────────────────────────────────────

def scope_phrase(data: dict) -> str:
    return f" for {data['user_email']}" if data["user_id"] is not None else ""


def summary_paragraphs(data: dict) -> list[str]:
    cur, prev = data["current"], data["previous"]
    series, prev_series = cur["series"], prev["series"]
    requests, errors = sums(series, "requests"), sums(series, "errors")
    prev_requests = sums(prev_series, "requests")
    text_change, _, direction = change(requests, prev_requests)
    trend = {1: "up", -1: "down", 0: "flat"}[direction]
    paragraphs = [
        f"From <b>{fmt_day(cur['start'])}</b> to <b>{fmt_day(cur['end'])}, {cur['end'][:4]}</b> (UTC){esc(scope_phrase(data))}, "
        f"Querex processed <b>{fmt_int(requests)}</b> tool requests from <b>{fmt_int(cur['active_users'])}</b> active "
        f"user{'s' if cur['active_users'] != 1 else ''}. Volume is <b>{trend}</b> "
        f"({esc(text_change)}; {fmt_int(prev_requests)} requests in the preceding {data['days']}-day period). "
        f"{fmt_int(sums(series, 'signups'))} new account{'s' if sums(series, 'signups') != 1 else ''} registered "
        f"and users opened {fmt_int(sums(series, 'sessions'))} chat sessions with {fmt_int(sums(series, 'messages'))} messages."
    ]
    if requests:
        latency = cur["latency"]
        paragraphs.append(
            f"<b>Reliability.</b> {pct(requests - errors, requests):.1f}% of requests succeeded "
            f"({fmt_int(errors)} failed, a {pct(errors, requests):.1f}% error rate). Average latency was "
            f"<b>{fmt_ms(latency['avg_ms'])}</b> and the slowest 5% of requests took <b>{fmt_ms(latency['p95_ms'])}</b> or longer."
        )
    if cur["tools"]:
        top = cur["tools"][0]
        peak_day = max(series, key=lambda d: d["requests"])
        paragraphs.append(
            f"<b>Usage.</b> {esc(top['label'])} was the most used product with {fmt_int(top['requests'])} requests "
            f"({pct(top['requests'], requests):.0f}% of traffic). The busiest day was <b>{fmt_day(peak_day['date'])}</b> "
            f"with {fmt_int(peak_day['requests'])} requests."
        )
    engagement = cur["engagement"]
    if data["user_id"] is not None:
        active_days = engagement["active_days"]
        paragraphs.append(
            f"<b>Activity.</b> This user was active on <b>{active_days}</b> of the 30 days ending {fmt_day(cur['end'])}."
        )
    elif engagement["mau"]:
        mau, wau = engagement["mau"], engagement["wau"]
        paragraphs.append(
            f"<b>Engagement.</b> In the 30 days ending {fmt_day(cur['end'])}, {fmt_int(mau)} distinct user{'s were' if mau != 1 else ' was'} "
            f"active, with an average of {engagement['avg_dau']} per day (stickiness <b>{engagement['stickiness_pct']}%</b>). "
            f"{fmt_int(wau)} {'were' if wau != 1 else 'was'} active in the final 7 days."
        )
    if data["end"] >= data["generated_at"].date():
        paragraphs.append(
            f"<i>Note: {data['end'].isoformat()} was still in progress when this report was generated, so the final day "
            "is partial and may look lower than a complete day.</i>"
        )
    return paragraphs


def observations(data: dict) -> list[tuple[str, str]]:
    """(severity, text) with severity in good / watch / action."""
    cur = data["current"]
    series = cur["series"]
    requests, errors = sums(series, "requests"), sums(series, "errors")
    out: list[tuple[str, str]] = []
    if requests == 0:
        return [("watch", "No tool requests were recorded in this period, so usage and reliability findings are unavailable.")]

    rate = pct(errors, requests)
    if rate >= 5:
        worst = max(cur["tools"], key=lambda t: t["error_rate"] * (t["requests"] > 4))
        out.append(
            ("action", f"The overall error rate is {rate:.1f}%, above the 5% guideline. {worst['label']} is the largest contributor "
             f"({worst['errors']} of {worst['requests']} requests failed). Review the error breakdown in section 4.")
        )
    elif rate >= 2:
        out.append(("watch", f"The error rate of {rate:.1f}% is elevated but under the 5% guideline."))
    else:
        out.append(("good", f"Reliability is healthy: {100 - rate:.1f}% of requests succeeded."))

    p95 = cur["latency"]["p95_ms"]
    if p95 >= 60_000:
        out.append(("watch", f"The slowest 5% of requests take {fmt_ms(p95)} or longer. Long-running AI calls hurt perceived quality; consider streaming feedback or timeouts."))
    elif p95 >= 20_000:
        out.append(("watch", f"p95 latency is {fmt_ms(p95)}; keep an eye on the slowest tools in section 3."))

    engagement = cur["engagement"]
    if data["user_id"] is not None:
        pass
    elif engagement["mau"] >= 5 and engagement["stickiness_pct"] < 10:
        out.append(("watch", f"Stickiness is {engagement['stickiness_pct']}%: most monthly users do not return daily. Consider re-engagement prompts."))
    elif engagement["stickiness_pct"] >= 20:
        out.append(("good", f"Stickiness of {engagement['stickiness_pct']}% indicates a habit-forming product."))

    if cur["tools"]:
        top = cur["tools"][0]
        share = pct(top["requests"], requests)
        if share >= 60 and len(cur["tools"]) > 1:
            out.append(("watch", f"{top['label']} accounts for {share:.0f}% of traffic; the other products are under-used."))

    prev_requests = sums(data["previous"]["series"], "requests")
    if prev_requests and requests >= prev_requests * 1.25:
        out.append(("good", f"Traffic grew {pct(requests - prev_requests, prev_requests):.0f}% versus the previous period."))
    elif prev_requests and requests <= prev_requests * 0.75:
        out.append(("watch", f"Traffic fell {pct(prev_requests - requests, prev_requests):.0f}% versus the previous period."))
    return out


# ── Sections ───────────────────────────────────────────────────────────────────

def build_summary(data: dict, styles: dict) -> list:
    cur, prev = data["current"], data["previous"]
    series, prev_series = cur["series"], prev["series"]
    requests, errors = sums(series, "requests"), sums(series, "errors")
    prev_requests, prev_errors = sums(prev_series, "requests"), sums(prev_series, "errors")

    def note(current: float, previous: float, higher_is_better: bool = True) -> tuple[str, colors.Color]:
        text, neutral, direction = change(current, previous)
        if direction == 0 or neutral is not None:
            return text, neutral or MUTED
        return text, GOOD if (direction > 0) == higher_is_better else BAD

    rate, prev_rate = pct(errors, requests), pct(prev_errors, prev_requests)
    rate_note = (
        (f"{rate - prev_rate:+.1f} pts vs prior", GOOD if rate <= prev_rate else BAD) if prev_requests else ("no prior data", MUTED)
    )
    cards = [
        ("Tool requests", fmt_int(requests), *note(requests, prev_requests)),
        ("Active days", fmt_int(sum(1 for d in series if d["requests"])), f"of {len(series)} days", MUTED)
        if data["user_id"] is not None
        else ("Active users", fmt_int(cur["active_users"]), *note(cur["active_users"], prev["active_users"])),
        ("Error rate", f"{rate:.1f}%", *rate_note),
        ("New sign-ups", fmt_int(sums(series, "signups")), *note(sums(series, "signups"), sums(prev_series, "signups"))),
        ("Chat sessions", fmt_int(sums(series, "sessions")), *note(sums(series, "sessions"), sums(prev_series, "sessions"))),
        ("Chat messages", fmt_int(sums(series, "messages")), *note(sums(series, "messages"), sums(prev_series, "messages"))),
        ("Avg latency", fmt_ms(cur["latency"]["avg_ms"]), f"p95 {fmt_ms(cur['latency']['p95_ms'])}", MUTED),
        ("Active days (30d)", fmt_int(cur["engagement"]["active_days"]), f"30 days to {cur['end']}", MUTED)
        if data["user_id"] is not None
        else ("Stickiness", f"{cur['engagement']['stickiness_pct']}%", f"avg DAU {cur['engagement']['avg_dau']} / MAU {cur['engagement']['mau']}", MUTED),
    ]
    flow = section("1. Executive summary", styles)
    flow.append(kpi_grid(cards, 4, styles))
    flow.append(Spacer(1, 6))
    flow.append(Paragraph("Overview", styles["h2"]))
    for paragraph in summary_paragraphs(data):
        flow.append(Paragraph(paragraph, styles["body"]))

    flow.append(Paragraph("Key observations", styles["h2"]))
    tone = {"good": ("OK", GOOD), "watch": ("WATCH", WARN), "action": ("ACT", BAD)}
    rows = []
    for severity, text in observations(data):
        label, color = tone[severity]
        rows.append(
            [
                Paragraph(f'<font color="{color.hexval().replace("0x", "#")}"><b>{label}</b></font>', styles["cell"]),
                Paragraph(esc(text), styles["cell"]),
            ]
        )
    table = Table(rows, colWidths=[16 * mm, CONTENT_W - 16 * mm])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    flow.append(table)
    return flow


def build_traffic(data: dict, styles: dict) -> list:
    cur = data["current"]
    series = cur["series"]
    labels = [fmt_day(d["date"]) for d in series]
    flow = section(
        "2. Traffic and growth",
        styles,
        "Daily tool requests and failures, the number of distinct people using the platform each day, and new registrations. "
        "All days are UTC.",
    )
    flow.append(
        figure(
            charts.line_chart(
                CONTENT_W, 150, labels,
                [
                    charts.Series("Requests", [d["requests"] for d in series], charts.PALETTE[0]),
                    charts.Series("Errors", [d["errors"] for d in series], charts.PALETTE[4]),
                ],
            ),
            "Figure 2.1 - Tool requests and errors per day.",
            styles,
        )
    )
    flow.append(
        figure(
            charts.line_chart(
                CONTENT_W, 120, labels, [charts.Series("Active users", [d["active_users"] for d in series], charts.PALETTE[2])]
            ),
            "Figure 2.2 - Distinct active users per day.",
            styles,
        )
    )
    flow.append(
        figure(
            charts.bar_chart(CONTENT_W, 110, labels, [d["signups"] for d in series], charts.PALETTE[1]),
            "Figure 2.3 - New account registrations per day.",
            styles,
        )
    )
    peak = max(series, key=lambda d: d["requests"])
    quiet = [d for d in series if d["requests"] == 0]
    flow.append(
        Paragraph(
            f"The busiest day was <b>{fmt_day(peak['date'])}</b> ({fmt_int(peak['requests'])} requests, "
            f"{fmt_int(peak['active_users'])} active users). {len(quiet)} of {len(series)} days had no recorded activity.",
            styles["body"],
        )
    )
    return flow


def build_products(data: dict, styles: dict) -> list:
    cur = data["current"]
    tools = cur["tools"]
    total = sum(t["requests"] for t in tools)
    flow = section(
        "3. Product usage and performance",
        styles,
        "How traffic splits across the platform's tools, and how fast and reliable each one is.",
    )
    if not tools:
        flow.append(Paragraph("No tool requests were recorded in this period.", styles["body"]))
        return flow
    slices = [(t["label"], t["requests"], charts.PALETTE[i % len(charts.PALETTE)]) for i, t in enumerate(tools)]
    flow.append(
        figure(charts.donut_chart(CONTENT_W, 150, slices, fmt_int(total), "REQUESTS"), "Figure 3.1 - Share of requests by tool.", styles)
    )
    rows = [
        [
            t["label"], fmt_int(t["requests"]), f"{pct(t['requests'], total):.1f}%", fmt_int(t["users"]),
            fmt_int(t["errors"]), f"{t['error_rate'] * 100:.1f}%", fmt_ms(t["avg_ms"]), fmt_ms(t["p95_ms"]),
        ]
        for t in tools
    ]
    flow.append(
        data_table(
            ["Tool", "Requests", "Share", "Users", "Errors", "Error rate", "Avg latency", "p95 latency"],
            rows,
            [42 * mm, 21 * mm, 17 * mm, 15 * mm, 16 * mm, 20 * mm, 22 * mm, CONTENT_W - 153 * mm],
            styles,
        )
    )
    flow.append(Paragraph("Table 3.1 - Per-tool volume, reliability and latency.", styles["caption"]))
    flow.append(
        figure(
            charts.hbar_chart(
                CONTENT_W,
                [(t["label"], t["avg_ms"], charts.PALETTE[i % len(charts.PALETTE)], fmt_ms(t["avg_ms"])) for i, t in enumerate(tools)],
            ),
            "Figure 3.2 - Average latency by tool.",
            styles,
        )
    )
    return flow


def build_reliability(data: dict, styles: dict) -> list:
    cur = data["current"]
    series = cur["series"]
    requests, errors = sums(series, "requests"), sums(series, "errors")
    flow = section(
        "4. Reliability",
        styles,
        f"{fmt_int(errors)} of {fmt_int(requests)} requests failed ({pct(errors, requests):.1f}%). "
        "This section shows where failures concentrate and which requests were slowest.",
    )
    labels = [fmt_day(d["date"]) for d in series]
    flow.append(
        figure(
            charts.bar_chart(CONTENT_W, 110, labels, [d["errors"] for d in series], charts.PALETTE[4]),
            "Figure 4.1 - Errors per day.",
            styles,
        )
    )
    failing = [t for t in cur["tools"] if t["errors"]]
    if failing:
        flow.append(
            figure(
                charts.hbar_chart(
                    CONTENT_W,
                    [(t["label"], t["error_rate"] * 100, charts.PALETTE[4], f"{t['error_rate'] * 100:.1f}%  ({t['errors']})") for t in failing],
                ),
                "Figure 4.2 - Error rate by tool (failed requests in brackets).",
                styles,
            )
        )
    if data["error_codes"]:
        flow.append(Paragraph("Failures by HTTP status", styles["h2"]))
        flow.append(
            data_table(
                ["Status", "Failed requests", "Share of failures"],
                [[str(code), fmt_int(n), f"{pct(n, errors):.1f}%"] for code, n in data["error_codes"]],
                [30 * mm, 40 * mm, 40 * mm],
                styles,
            )
        )
        flow.append(Spacer(1, 6))
    worst = sorted((d for d in series if d["errors"]), key=lambda d: -d["errors"])[:5]
    if worst:
        flow.append(Paragraph("Days with the most failures", styles["h2"]))
        flow.append(
            data_table(
                ["Date", "Errors", "Requests", "Error rate"],
                [[d["date"], fmt_int(d["errors"]), fmt_int(d["requests"]), f"{pct(d['errors'], d['requests']):.1f}%"] for d in worst],
                [34 * mm, 28 * mm, 28 * mm, 28 * mm],
                styles,
            )
        )
        flow.append(Spacer(1, 6))
    if data["slow_requests"]:
        flow.append(Paragraph("Slowest requests", styles["h2"]))
        flow.append(
            data_table(
                ["When (UTC)", "Tool", "Duration", "Status", "User"],
                [
                    [fmt_stamp(r["at"]), TOOL_LABELS.get(r["tool"], r["tool"]), fmt_ms(r["duration_ms"]), str(r["status"]), r["user"]]
                    for r in data["slow_requests"]
                ],
                [32 * mm, 30 * mm, 22 * mm, 16 * mm, CONTENT_W - 100 * mm],
                styles,
                right_from=99,
            )
        )
    return flow


def build_users(data: dict, styles: dict) -> list:
    cur = data["current"]
    engagement = cur["engagement"]
    if data["user_id"] is not None:
        flow = section(
            "5. User activity",
            styles,
            f"Activity for {esc(data['user_email'])}. Platform-wide engagement measures (DAU, WAU, MAU) do not apply to a single user.",
        )
        active_days = engagement["active_days"]
        flow.append(
            kpi_grid(
                [
                    ("Active days (30d)", fmt_int(active_days), f"30 days to {cur['end']}", MUTED),
                    ("Requests (period)", fmt_int(sums(cur["series"], "requests")), "tool calls", MUTED),
                    ("Sessions (period)", fmt_int(sums(cur["series"], "sessions")), "chat sessions", MUTED),
                    ("Messages (period)", fmt_int(sums(cur["series"], "messages")), "chat messages", MUTED),
                ],
                4,
                styles,
            )
        )
        return flow
    flow = section(
        "5. Users and engagement",
        styles,
        f"Engagement is measured over the 30 days ending {cur['end']}. Stickiness is the average daily active users "
        "divided by the distinct users active in the window: the closer to 100%, the more people use Querex every day.",
    )
    flow.append(
        kpi_grid(
            [
                ("DAU (last day)", fmt_int(engagement["dau"]), cur["end"], MUTED),
                ("WAU (7 days)", fmt_int(engagement["wau"]), "distinct users", MUTED),
                ("MAU (30 days)", fmt_int(engagement["mau"]), "distinct users", MUTED),
                ("Stickiness", f"{engagement['stickiness_pct']}%", f"avg DAU {engagement['avg_dau']}", MUTED),
            ],
            4,
            styles,
        )
    )
    flow.append(Spacer(1, 8))
    accounts = data["accounts"]
    if accounts:
        flow.append(Paragraph("Accounts", styles["h2"]))
        flow.append(
            charts.donut_chart(
                CONTENT_W, 100,
                [
                    ("Active", accounts["active"] - accounts["admins"] if accounts["active"] >= accounts["admins"] else accounts["active"], charts.PALETTE[2]),
                    ("Admins", accounts["admins"], charts.PALETTE[3]),
                    ("Suspended", accounts["suspended"], charts.PALETTE[4]),
                ],
                fmt_int(accounts["total"]),
                "ACCOUNTS",
            )
        )
        flow.append(
            Paragraph(
                f"{fmt_int(accounts['total'])} accounts exist in total: {fmt_int(accounts['active'])} active "
                f"(including {fmt_int(accounts['admins'])} administrators), {fmt_int(accounts['suspended'])} suspended, and "
                f"{fmt_int(accounts['verified'])} with a verified email address.",
                styles["body"],
            )
        )
    if cur["top_users"]:
        total = sum(t["requests"] for t in cur["tools"]) or 1
        flow.append(Paragraph("Most active users", styles["h2"]))
        flow.append(
            data_table(
                ["#", "User", "Requests", "Share of traffic"],
                [[str(i + 1), u["email"], fmt_int(u["requests"]), f"{pct(u['requests'], total):.1f}%"] for i, u in enumerate(cur["top_users"])],
                [10 * mm, CONTENT_W - 84 * mm, 30 * mm, 44 * mm],
                styles,
                right_from=2,
            )
        )
    return flow


def build_patterns(data: dict, styles: dict) -> list:
    cur = data["current"]
    grid = [[0.0] * 24 for _ in range(7)]
    err_grid = [[0.0] * 24 for _ in range(7)]
    for cell in cur["hourly"]:
        grid[cell["weekday"]][cell["hour"]] = cell["requests"]
        err_grid[cell["weekday"]][cell["hour"]] = cell["errors"]
    weekday_totals = [sum(row) for row in grid]
    hour_totals = [sum(grid[w][h] for w in range(7)) for h in range(24)]
    flow = section(
        "6. Activity patterns",
        styles,
        "When people use the platform. Darker cells mean more requests in that UTC weekday and hour across the whole period.",
    )
    flow.append(figure(charts.heatmap_chart(CONTENT_W, 150, grid), "Figure 6.1 - Requests by UTC weekday and hour.", styles))
    if sum(sum(row) for row in err_grid):
        flow.append(
            figure(
                charts.heatmap_chart(CONTENT_W, 150, err_grid, charts.HEAT_ERR_HIGH),
                "Figure 6.2 - Errors by UTC weekday and hour.",
                styles,
            )
        )
    flow.append(
        figure(
            charts.bar_chart(CONTENT_W, 100, charts.WEEKDAYS, weekday_totals, charts.PALETTE[1]),
            "Figure 6.3 - Requests by weekday.",
            styles,
        )
    )
    if sum(weekday_totals):
        busiest_day = charts.WEEKDAYS[weekday_totals.index(max(weekday_totals))]
        busiest_hour = hour_totals.index(max(hour_totals))
        flow.append(
            Paragraph(
                f"Traffic peaks on <b>{busiest_day}</b> and around <b>{busiest_hour:02d}:00 UTC</b>. "
                "Schedule maintenance and deployments outside these windows.",
                styles["body"],
            )
        )
    return flow


def build_content(data: dict, styles: dict) -> list:
    cur = data["current"]
    series = cur["series"]
    docs = data["documents"]
    flow = section(
        "7. Content and storage",
        styles,
        "What users created and stored. Document counts are a current snapshot; the other figures cover the report period.",
    )
    flow.append(
        kpi_grid(
            [
                ("Documents stored", fmt_int(docs["count"]), fmt_bytes(docs["bytes"]), MUTED),
                ("Uploaded in period", fmt_int(sums(series, "documents")), "PDF documents", MUTED),
                ("Humanizer runs", fmt_int(sums(series, "humanizer_runs")), "in period", MUTED),
                ("Real-time chats", fmt_int(sums(series, "realtime_sessions")), "in period", MUTED),
            ],
            4,
            styles,
        )
    )
    flow.append(Spacer(1, 8))
    status = docs["by_status"]
    if status:
        flow.append(
            figure(
                charts.donut_chart(
                    CONTENT_W, 100,
                    [(name.replace("_", " ").title(), n, charts.PALETTE[i % len(charts.PALETTE)]) for i, (name, n) in enumerate(status.items())],
                    fmt_int(sum(status.values())),
                    "DOCUMENTS",
                ),
                "Figure 7.1 - Documents by processing status (current snapshot).",
                styles,
            )
        )
    else:
        flow.append(Paragraph("No documents are currently stored.", styles["body"]))
    return flow


def build_operations(data: dict, styles: dict) -> list:
    switches = data["switches"]
    flow = section(
        "8. Platform operations",
        styles,
        "The platform's operating state when this report was generated, and administrator activity during the period.",
    )
    state = lambda on: "Enabled" if on else "DISABLED"  # noqa: E731
    rows = [
        ["Maintenance mode", "ACTIVE" if switches["maintenance"] else "Off"],
        ["New sign-ups", state(switches["signups"])],
    ] + [[label, state(on)] for label, on in switches["tools"]]
    flow.append(data_table(["Setting", "State"], rows, [70 * mm, 40 * mm], styles, right_from=99))
    flow.append(Spacer(1, 8))
    actions = data["admin_actions"]
    if actions is None:
        flow.append(Paragraph("Administrator activity is only reported for the whole platform, not for a single user.", styles["body"]))
        return flow
    flow.append(Paragraph("Administrator activity", styles["h2"]))
    if not actions["total"]:
        flow.append(Paragraph("No administrator actions were recorded in this period.", styles["body"]))
        return flow
    flow.append(
        Paragraph(
            f"{fmt_int(actions['total'])} administrator action{'s were' if actions['total'] != 1 else ' was'} recorded.",
            styles["body"],
        )
    )
    flow.append(
        data_table(
            ["Action", "Count"], [[a, fmt_int(n)] for a, n in actions["counts"]], [70 * mm, 30 * mm], styles
        )
    )
    flow.append(Spacer(1, 6))
    flow.append(Paragraph("Most recent actions", styles["h2"]))
    flow.append(
        data_table(
            ["When (UTC)", "Administrator", "Action", "Target"],
            [[fmt_stamp(r["at"]), r["admin"], r["action"], r["target"]] for r in actions["recent"]],
            [32 * mm, 52 * mm, 34 * mm, CONTENT_W - 118 * mm],
            styles,
            right_from=99,
        )
    )
    return flow


def build_appendix(data: dict, styles: dict) -> list:
    series = data["current"]["series"]
    flow = [PageBreak(), Paragraph("Appendix A. Daily data", styles["h1"]), Spacer(1, 4)]
    flow.append(
        Paragraph("Every figure in this report is derived from the rows below (UTC days).", styles["body"])
    )
    headers = ["Date", "Requests", "Errors", "Err %", "Active", "Sign-ups", "Sess.", "Msgs", "Docs", "Human.", "RT"]
    rows = [
        [
            d["date"], fmt_int(d["requests"]), fmt_int(d["errors"]), f"{pct(d['errors'], d['requests']):.1f}",
            fmt_int(d["active_users"]), fmt_int(d["signups"]), fmt_int(d["sessions"]), fmt_int(d["messages"]),
            fmt_int(d["documents"]), fmt_int(d["humanizer_runs"]), fmt_int(d["realtime_sessions"]),
        ]
        for d in series
    ]
    total = [
        "Total", fmt_int(sums(series, "requests")), fmt_int(sums(series, "errors")),
        f"{pct(sums(series, 'errors'), sums(series, 'requests')):.1f}", "-", fmt_int(sums(series, "signups")),
        fmt_int(sums(series, "sessions")), fmt_int(sums(series, "messages")), fmt_int(sums(series, "documents")),
        fmt_int(sums(series, "humanizer_runs")), fmt_int(sums(series, "realtime_sessions")),
    ]
    widths = [24 * mm] + [(CONTENT_W - 24 * mm) / 10] * 10
    table = data_table(headers, rows + [total], widths, styles, compact=True)
    table.setStyle(TableStyle([("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f1e4d3")), ("LINEABOVE", (0, -1), (-1, -1), 0.8, INK)]))
    flow.append(table)
    flow.append(
        Paragraph(
            "Active = distinct active users; Sess. = chat sessions; Msgs = chat messages; Docs = documents uploaded; "
            "Human. = Humanizer runs; RT = real-time chat sessions.",
            styles["caption"],
        )
    )

    flow += [
        PageBreak(),
        Paragraph("Appendix B. Methodology and definitions", styles["h1"]),
        Spacer(1, 4),
    ]
    definitions = [
        ("Time zone", "All dates, days and hours are UTC. A day runs from 00:00:00 to 23:59:59 UTC."),
        ("Tool request", "One call to a Querex tool (Research Copilot, Humanizer, AI Checker, Real-time AI, Paper Analyzer, upload, "
                         "extraction). A request is a failure when the server answered with an error status (4xx/5xx) or the tool reported failure."),
        ("Active user", "A signed-in user who made at least one tool request. Anonymous requests are counted as traffic but not as users."),
        ("DAU / WAU / MAU", "Distinct active users on the final day, in the final 7 days, and in the final 30 days of the period."),
        ("Stickiness", "Average daily active users over the 30-day window divided by MAU. It measures how often monthly users come back."),
        ("Latency", "Server-side time from request start until the response finished streaming. p95 is the value 95% of requests beat; "
                    "it is computed from up to the most recent 5,000 requests per tool (20,000 overall)."),
        ("Chat messages", "Each user and assistant message is counted on the day it was stored. Messages created before "
                          "timestamps were introduced (26 Sep 2026) are attributed to the day their conversation started."),
        ("Comparison period", f"Changes compare against the {data['days']} days immediately before the report period "
                               f"({data['previous_start']} to {data['previous_end']})."),
        ("Snapshots", "Account totals, document counts, storage and platform switches describe the moment the report was generated, "
                      "not the report period."),
    ]
    flow.append(data_table(["Term", "Definition"], [[t, d] for t, d in definitions], [34 * mm, CONTENT_W - 34 * mm], styles, right_from=99))
    return flow


# ── Document scaffolding ───────────────────────────────────────────────────────

class NumberedCanvas(rl_canvas.Canvas):
    """Canvas that knows the total page count so the footer can read 'Page 3 of 12'."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_pages: list[dict] = []

    def showPage(self):
        self._saved_pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved_pages)
        for state in self._saved_pages:
            self.__dict__.update(state)
            if self._pageNumber > 1:
                self.setFont("Helvetica", 7.5)
                self.setFillColor(MUTED)
                self.drawRightString(PAGE_W - MARGIN, 10 * mm, f"Page {self._pageNumber} of {total}")
            super().showPage()
        super().save()


class ReportDoc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in {"H1"}:
            text = flowable.getPlainText()
            key = f"section-{self.page}-{abs(hash(text)) % 10_000}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, 0, 0)
            self.notify("TOCEntry", (0, text, self.page, key))


def draw_cover(canv, doc, data: dict) -> None:
    canv.saveState()
    canv.setFillColor(INK)
    canv.rect(0, PAGE_H - 92 * mm, PAGE_W, 92 * mm, stroke=0, fill=1)
    canv.setFillColor(BRAND)
    canv.rect(0, PAGE_H - 94 * mm, PAGE_W, 2 * mm, stroke=0, fill=1)
    canv.setFillColor(colors.HexColor("#f0ac6e"))
    canv.setFont("Helvetica-Bold", 11)
    canv.drawString(MARGIN, PAGE_H - 30 * mm, "QUEREX  |  PLATFORM REPORT")
    canv.setFillColor(colors.white)
    canv.setFont("Helvetica-Bold", 30)
    canv.drawString(MARGIN, PAGE_H - 52 * mm, "Operations & Analytics")
    canv.drawString(MARGIN, PAGE_H - 64 * mm, "Report")
    canv.setFont("Helvetica", 12)
    canv.setFillColor(colors.HexColor("#e9dfd0"))
    canv.drawString(MARGIN, PAGE_H - 78 * mm, f"{data['start'].strftime('%d %B %Y')}  to  {data['end'].strftime('%d %B %Y')}  (UTC)")
    canv.restoreState()


def draw_page(canv, doc, data: dict) -> None:
    canv.saveState()
    canv.setStrokeColor(RULE)
    canv.setLineWidth(0.6)
    canv.line(MARGIN, PAGE_H - 13 * mm, PAGE_W - MARGIN, PAGE_H - 13 * mm)
    canv.setFont("Helvetica-Bold", 8)
    canv.setFillColor(BRAND)
    canv.drawString(MARGIN, PAGE_H - 10 * mm, "QUEREX")
    canv.setFont("Helvetica", 8)
    canv.setFillColor(MUTED)
    canv.drawRightString(
        PAGE_W - MARGIN, PAGE_H - 10 * mm, f"{data['start'].isoformat()} to {data['end'].isoformat()} (UTC){charts.safe(scope_phrase(data))}"
    )
    canv.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
    canv.setFont("Helvetica", 7.5)
    canv.drawString(MARGIN, 10 * mm, "Confidential - generated by the Querex admin console")
    canv.restoreState()


def build_cover(data: dict, styles: dict) -> list:
    scope = data["user_email"] or "All users (whole platform)"
    rows = [
        ["Reporting period", f"{data['start'].isoformat()} to {data['end'].isoformat()} ({data['days']} days, UTC)"],
        ["Comparison period", f"{data['previous_start'].isoformat()} to {data['previous_end'].isoformat()}"],
        ["Scope", scope],
        ["Generated", data["generated_at"].strftime("%Y-%m-%d %H:%M UTC")],
        ["Generated by", data["generated_by"]],
    ]
    table = Table([[Paragraph(esc(k), styles["kpi_label"]), Paragraph(esc(v), styles["body"])] for k, v in rows], colWidths=[38 * mm, CONTENT_W - 38 * mm])
    table.setStyle(
        TableStyle(
            [("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
        )
    )
    return [Spacer(1, 118 * mm), table, NextPageTemplate("body"), PageBreak()]


def build_contents(data: dict, styles: dict) -> list:
    toc = TableOfContents()
    toc.levelStyles = [ParagraphStyle("toc0", fontName="Helvetica", fontSize=11, leading=22, textColor=INK, leftIndent=0)]
    scope = "the whole platform" if data["user_id"] is None else data["user_email"]
    return [
        Paragraph("Contents", styles["contents_title"]),
        Spacer(1, 6),
        toc,
        Spacer(1, 14),
        Paragraph("About this report", styles["h2"]),
        Paragraph(
            f"This report describes how Querex was used and how it performed for {esc(scope)} between "
            f"{data['start'].isoformat()} and {data['end'].isoformat()} (UTC). Sections 1 to 8 move from a one-page "
            "summary through traffic, product usage, reliability, engagement, usage patterns, content and platform "
            "operations. Every chart is drawn from the daily figures in Appendix A, and Appendix B defines each metric.",
            styles["body"],
        ),
        Paragraph(
            "Changes are measured against the period of the same length immediately before the report period. "
            "Figures that describe the current state (accounts, documents, platform switches) are snapshots taken "
            "when the report was generated.",
            styles["body"],
        ),
        PageBreak(),
    ]


def build_report_pdf(data: dict) -> bytes:
    styles = make_styles()
    buffer = io.BytesIO()
    title = f"Querex report {data['start'].isoformat()} to {data['end'].isoformat()}"
    doc = ReportDoc(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=title,
        author=data["generated_by"],
        subject="Querex platform operations and analytics",
        creator="Querex admin console",
    )
    cover_frame = Frame(MARGIN, 18 * mm, CONTENT_W, PAGE_H - 36 * mm, id="cover", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    body_frame = Frame(MARGIN, 20 * mm, CONTENT_W, PAGE_H - 40 * mm, id="body", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates(
        [
            PageTemplate(id="cover", frames=[cover_frame], onPage=lambda c, d: draw_cover(c, d, data)),
            PageTemplate(id="body", frames=[body_frame], onPage=lambda c, d: draw_page(c, d, data)),
        ]
    )
    story = build_cover(data, styles)
    story += build_contents(data, styles)
    story += build_summary(data, styles)
    story += build_traffic(data, styles)
    story += build_products(data, styles)
    story += build_reliability(data, styles)
    story += build_users(data, styles)
    story += build_patterns(data, styles)
    story += build_content(data, styles)
    story += build_operations(data, styles)
    story += build_appendix(data, styles)
    doc.multiBuild(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()
