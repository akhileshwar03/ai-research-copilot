"""Vector chart drawings for the admin PDF report (pure reportlab, no image dependencies)."""

import math
from dataclasses import dataclass

from reportlab.graphics.shapes import Circle, Drawing, Line, Polygon, PolyLine, Rect, String, Wedge
from reportlab.lib import colors

INK = colors.HexColor("#241c14")
MUTED = colors.HexColor("#6b5f52")
GRID = colors.HexColor("#e9dfd0")
BRAND = colors.HexColor("#c5691f")
SURFACE = colors.HexColor("#fbf7f1")

PALETTE = [
    colors.HexColor("#d9793a"),
    colors.HexColor("#0284c7"),
    colors.HexColor("#059669"),
    colors.HexColor("#7c3aed"),
    colors.HexColor("#e11d48"),
    colors.HexColor("#d97706"),
    colors.HexColor("#0891b2"),
    colors.HexColor("#4f46e5"),
    colors.HexColor("#64748b"),
]

HEAT_LOW = colors.HexColor("#fbeee0")
HEAT_HIGH = colors.HexColor("#b4530f")
HEAT_ERR_HIGH = colors.HexColor("#b4183c")


@dataclass
class Series:
    name: str
    values: list[float]
    color: colors.Color


def safe(text: object) -> str:
    """Helvetica is a Latin-1 font; replace anything it can't draw."""
    return str(text).encode("latin-1", "replace").decode("latin-1")


def txt(x: float, y: float, text: str, **kwargs) -> String:
    kwargs.setdefault("fontName", "Helvetica")
    return String(x, y, text, **kwargs)


def axis_scale(peak_value: float) -> tuple[float, int]:
    """(axis maximum, tick count). Small integer counts get whole-number ticks."""
    if peak_value <= 8:
        top = max(1, math.ceil(peak_value))
        return float(top), min(top, 4) if top > 4 and top % 4 == 0 else top if top <= 4 else 4
    return nice_ceiling(peak_value), 4


def nice_ceiling(value: float) -> float:
    if value <= 0:
        return 1.0
    exponent = math.floor(math.log10(value))
    fraction = value / 10**exponent
    for step in (1, 2, 2.5, 5, 10):
        if fraction <= step:
            return step * 10**exponent
    return 10 ** (exponent + 1)


def format_number(value: float) -> str:
    if abs(value) >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    if abs(value) >= 10_000:
        return f"{value / 1000:.0f}k"
    if abs(value) >= 1000:
        return f"{value / 1000:.1f}k"
    return f"{value:,.0f}" if float(value).is_integer() else f"{value:.1f}"


def blend(low: colors.Color, high: colors.Color, t: float) -> colors.Color:
    t = min(1.0, max(0.0, t))
    return colors.Color(
        low.red + (high.red - low.red) * t,
        low.green + (high.green - low.green) * t,
        low.blue + (high.blue - low.blue) * t,
    )


def _empty(width: float, height: float, message: str) -> Drawing:
    drawing = Drawing(width, height)
    drawing.add(Rect(0, 0, width, height, fillColor=SURFACE, strokeColor=GRID, strokeWidth=0.6, rx=4, ry=4))
    drawing.add(txt(width / 2, height / 2 - 3, message, fontSize=9, fillColor=MUTED, textAnchor="middle"))
    return drawing


def _label_indices(count: int, target: int = 7) -> list[int]:
    if count <= target:
        return list(range(count))
    step = (count - 1) / (target - 1)
    return sorted({round(i * step) for i in range(target)})


def _axes(drawing: Drawing, left: float, bottom: float, plot_w: float, plot_h: float, y_max: float, ticks: int) -> None:
    for i in range(ticks + 1):
        y = bottom + plot_h * i / ticks
        drawing.add(Line(left, y, left + plot_w, y, strokeColor=GRID, strokeWidth=0.5))
        drawing.add(
            txt(left - 5, y - 2.5, format_number(y_max * i / ticks), fontSize=7, fillColor=MUTED, textAnchor="end")
        )


def line_chart(
    width: float,
    height: float,
    x_labels: list[str],
    series: list[Series],
    *,
    fill: bool = True,
    y_max: float | None = None,
) -> Drawing:
    if not x_labels or not series or all(max(s.values, default=0) == 0 for s in series):
        return _empty(width, height, "No activity in this period")
    left, right, top, bottom = 34, 8, 16 if len(series) > 1 else 8, 20
    plot_w, plot_h = width - left - right, height - top - bottom
    peak, ticks = (y_max, 4) if y_max else axis_scale(max(max(s.values) for s in series))
    drawing = Drawing(width, height)
    _axes(drawing, left, bottom, plot_w, plot_h, peak, ticks)

    count = len(x_labels)
    step = plot_w / max(1, count - 1)

    def point(i: int, v: float) -> tuple[float, float]:
        x = left + (plot_w / 2 if count == 1 else step * i)
        return x, bottom + plot_h * min(v, peak) / peak

    for s in series:
        pts = [point(i, v) for i, v in enumerate(s.values)]
        if fill and len(pts) > 1:
            poly = [pts[0][0], bottom]
            for x, y in pts:
                poly += [x, y]
            poly += [pts[-1][0], bottom]
            drawing.add(
                Polygon(poly, fillColor=colors.Color(s.color.red, s.color.green, s.color.blue, alpha=0.14), strokeColor=None)
            )
        flat = [c for xy in pts for c in xy]
        if len(pts) > 1:
            drawing.add(PolyLine(flat, strokeColor=s.color, strokeWidth=1.4, strokeLineJoin=1))
        if count <= 45:
            for x, y in pts:
                drawing.add(Circle(x, y, 1.6, fillColor=colors.white, strokeColor=s.color, strokeWidth=1))

    for i in _label_indices(count):
        x = left + (plot_w / 2 if count == 1 else step * i)
        drawing.add(txt(x, 8, x_labels[i], fontSize=7, fillColor=MUTED, textAnchor="middle"))

    if len(series) > 1:
        x = left
        for s in series:
            drawing.add(Rect(x, height - 10, 8, 4, fillColor=s.color, strokeColor=None))
            drawing.add(txt(x + 11, height - 10, safe(s.name), fontSize=7.5, fillColor=INK))
            x += 22 + len(s.name) * 4.2
    return drawing


def bar_chart(width: float, height: float, x_labels: list[str], values: list[float], color: colors.Color) -> Drawing:
    if not values or max(values) == 0:
        return _empty(width, height, "No activity in this period")
    left, right, top, bottom = 34, 8, 8, 20
    plot_w, plot_h = width - left - right, height - top - bottom
    peak, ticks = axis_scale(max(values))
    drawing = Drawing(width, height)
    _axes(drawing, left, bottom, plot_w, plot_h, peak, ticks)
    slot = plot_w / len(values)
    bar_w = max(1.2, slot * 0.68)
    for i, v in enumerate(values):
        h = plot_h * v / peak
        if h > 0:
            drawing.add(Rect(left + slot * i + (slot - bar_w) / 2, bottom, bar_w, h, fillColor=color, strokeColor=None))
    for i in _label_indices(len(values)):
        drawing.add(txt(left + slot * i + slot / 2, 8, x_labels[i], fontSize=7, fillColor=MUTED, textAnchor="middle"))
    return drawing


def hbar_chart(width: float, items: list[tuple[str, float, colors.Color, str]], row_h: float = 17) -> Drawing:
    """items: (label, value, color, value_label)."""
    height = max(row_h * len(items) + 4, 24)
    if not items:
        return _empty(width, 40, "No data")
    label_w, value_w = 118, 78
    bar_max = width - label_w - value_w
    peak = max(v for _, v, _, _ in items) or 1
    drawing = Drawing(width, height)
    for i, (label, value, color, value_label) in enumerate(items):
        y = height - row_h * (i + 1)
        drawing.add(txt(0, y + 4, safe(label)[:22], fontSize=8, fillColor=INK))
        drawing.add(Rect(label_w, y + 2, bar_max, 9, fillColor=SURFACE, strokeColor=None))
        bar = bar_max * value / peak
        if bar > 0:
            drawing.add(Rect(label_w, y + 2, max(1.5, bar), 9, fillColor=color, strokeColor=None))
        drawing.add(txt(label_w + bar_max + 6, y + 4, safe(value_label), fontSize=8, fillColor=MUTED))
    return drawing


def donut_chart(width: float, height: float, slices: list[tuple[str, float, colors.Color]], center: str, caption: str) -> Drawing:
    total = sum(v for _, v, _ in slices if v > 0)
    if total <= 0:
        return _empty(width, height, "No data")
    drawing = Drawing(width, height)
    radius = min(height / 2 - 4, width * 0.3)
    cx, cy = radius + 6, height / 2
    start = 90.0
    for _, value, color in slices:
        if value <= 0:
            continue
        sweep = 360 * value / total
        if sweep >= 359.99:
            drawing.add(Circle(cx, cy, radius, fillColor=color, strokeColor=colors.white, strokeWidth=1))
        else:
            drawing.add(
                Wedge(cx, cy, radius, start - sweep, start, fillColor=color, strokeColor=colors.white, strokeWidth=1)
            )
        start -= sweep
    drawing.add(Circle(cx, cy, radius * 0.6, fillColor=colors.white, strokeColor=None))
    drawing.add(txt(cx, cy - 1, safe(center), fontSize=13, fillColor=INK, textAnchor="middle", fontName="Helvetica-Bold"))
    drawing.add(txt(cx, cy - 12, safe(caption), fontSize=6.5, fillColor=MUTED, textAnchor="middle"))

    lx = cx + radius + 18
    ly = cy + min(len(slices), 9) * 7.5 - 2
    for label, value, color in slices[:9]:
        drawing.add(Rect(lx, ly - 1, 7, 7, fillColor=color, strokeColor=None))
        drawing.add(txt(lx + 11, ly, f"{safe(label)[:20]}", fontSize=7.8, fillColor=INK))
        share = f"{value / total * 100:.0f}%"
        drawing.add(txt(width - 4, ly, f"{format_number(value)}  ({share})", fontSize=7.8, fillColor=MUTED, textAnchor="end"))
        ly -= 15
    return drawing


WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def heatmap_chart(width: float, height: float, grid: list[list[float]], high: colors.Color = HEAT_HIGH) -> Drawing:
    """7 rows (Mon-Sun) x 24 columns (UTC hours)."""
    peak = max((v for row in grid for v in row), default=0)
    if peak <= 0:
        return _empty(width, height, "No activity in this period")
    left, top, bottom = 30, 14, 26
    cell_w = (width - left - 4) / 24
    cell_h = (height - top - bottom) / 7
    drawing = Drawing(width, height)
    for h in range(0, 24, 3):
        drawing.add(txt(left + cell_w * h + cell_w / 2, height - 9, f"{h:02d}h", fontSize=7, fillColor=MUTED, textAnchor="middle"))
    for w in range(7):
        y = height - top - cell_h * (w + 1)
        drawing.add(txt(left - 5, y + cell_h / 2 - 2.5, WEEKDAYS[w], fontSize=7.5, fillColor=MUTED, textAnchor="end"))
        for h in range(24):
            value = grid[w][h]
            fill = HEAT_LOW if value <= 0 else blend(HEAT_LOW, high, 0.18 + 0.82 * value / peak)
            drawing.add(
                Rect(left + cell_w * h + 0.7, y + 0.7, cell_w - 1.4, cell_h - 1.4, fillColor=fill, strokeColor=None, rx=1.5, ry=1.5)
            )
    legend_x = width - 4 - 5 * 16 - 42
    drawing.add(txt(legend_x, 7, "Low", fontSize=7, fillColor=MUTED, textAnchor="end"))
    for i in range(5):
        drawing.add(Rect(legend_x + 4 + i * 16, 5, 14, 8, fillColor=blend(HEAT_LOW, high, 0.18 + 0.82 * i / 4), strokeColor=None, rx=1.5, ry=1.5))
    drawing.add(txt(legend_x + 4 + 5 * 16 + 4, 7, f"{format_number(peak)} peak", fontSize=7, fillColor=MUTED))
    return drawing
