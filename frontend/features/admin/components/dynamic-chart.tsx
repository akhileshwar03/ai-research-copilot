"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { forwardedQuery } from "@/features/admin/lib/admin-query";
import { formatBytes, formatDay } from "@/features/admin/components/shared";
import { exportChartPng, exportTableCsv } from "@/features/admin/lib/chart-export";
import { CATEGORICAL_PALETTE } from "@/features/admin/lib/types";
import { CalendarHeatmapGrid } from "@/features/admin/components/chart-calendar";
import type { ChartDataPoint } from "@/features/admin/lib/chart-types";

type ChartType = "area" | "bar" | "calendar" | "donut";

type DataPoint = ChartDataPoint;

interface DynamicChartProps {
  id: string;
  metricKey?: string;
  title: string;
  subtitle?: string;
  data: DataPoint[];
  color?: string;
  unit?: string;
  /** How values are displayed; "bytes" renders KB/MB/GB. */
  valueFormat?: "number" | "bytes";
  height?: number;
  allowedViews?: ChartType[];
  isComposition?: boolean;
  dateRange?: string;
  scope?: string;
}


/** Folds a daily series into per-day (<=10 days), per-week (<=120 days) or per-month slices so every day is counted. */
type BucketPoint = DataPoint & { children?: DataPoint[] };

function bucketByPeriod(points: DataPoint[]): BucketPoint[] {
  if (points.length <= 10) return points;
  const mode = points.length <= 120 ? "week" : "month";
  const buckets = new Map<string, { first: string; last: string; value: number; children: DataPoint[] }>();
  for (const p of points) {
    const d = new Date(`${p.label.slice(0, 10)}T00:00:00Z`);
    let key: string;
    if (mode === "week") {
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      key = monday.toISOString().slice(0, 10);
    } else {
      key = p.label.slice(0, 7);
    }
    const b = buckets.get(key);
    if (b) {
      b.value += p.value;
      b.last = p.label;
      b.children.push(p);
    } else {
      buckets.set(key, { first: p.label, last: p.label, value: p.value, children: [p] });
    }
  }
  return [...buckets.values()].map((b) => ({
    label: mode === "week" ? `${formatDay(b.first)} – ${formatDay(b.last)}` : formatDay(b.first).replace(/\s\d+$/, "") + ` ${b.first.slice(0, 4)}`,
    value: b.value,
    children: b.children,
  }));
}

/** Axis top and tick count that land on round numbers (4 -> 0..4 by 1, 54 -> 0..60 by 15). */
function niceScale(maxValue: number): { top: number; ticks: number } {
  if (maxValue <= 4) {
    const n = Math.max(1, Math.ceil(maxValue));
    return { top: n, ticks: n };
  }
  const raw = maxValue / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  return { top: step * 4, ticks: 4 };
}

function donutSlicePath(cx: number, cy: number, rOuter: number, rInner: number, startRad: number, endRad: number): string {
  if (endRad - startRad >= Math.PI * 2 - 1e-4) {
    const ring = (r: number, sweep: 0 | 1) =>
      `M ${cx - r} ${cy} A ${r} ${r} 0 1 ${sweep} ${cx + r} ${cy} A ${r} ${r} 0 1 ${sweep} ${cx - r} ${cy} Z`;
    return `${ring(rOuter, 1)} ${ring(rInner, 0)}`;
  }
  const point = (r: number, rad: number) => `${cx + r * Math.cos(rad)} ${cy + r * Math.sin(rad)}`;
  const largeArc = endRad - startRad > Math.PI ? 1 : 0;
  return `M ${point(rOuter, startRad)} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${point(rOuter, endRad)} L ${point(rInner, endRad)} A ${rInner} ${rInner} 0 ${largeArc} 0 ${point(rInner, startRad)} Z`;
}

export function DynamicChart({
  id,
  metricKey,
  title,
  subtitle,
  data: rawData,
  color = "var(--marketing-accent)",
  unit = "",
  valueFormat = "number",
  height = 200,
  allowedViews,
  isComposition = false,
  dateRange,
  scope,
}: DynamicChartProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fmt = useCallback(
    (n: number) => (valueFormat === "bytes" ? formatBytes(n) : n.toLocaleString()),
    [valueFormat],
  );
  const data = useMemo(
    () => rawData.map((d) => (Number.isFinite(d.value) ? d : { ...d, value: 0 })),
    [rawData],
  );
  const autoId = useId();
  const chartId = id || autoId;
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-detect if data is composition or time series
  const isDateData = useMemo(() => {
    if (data.length === 0) return false;
    return /^\d{4}-\d{2}-\d{2}/.test(data[0].label);
  }, [data]);

  const effectiveComposition = isComposition || (!isDateData && data.length > 0);

  // Time series: area, bar, donut (share by day), calendar. Compositions: donut, bar.
  const validViews = useMemo<ChartType[]>(() => {
    if (allowedViews && allowedViews.length > 0) return allowedViews;
    return effectiveComposition ? ["donut", "bar"] : ["area", "bar", "donut", "calendar"];
  }, [allowedViews, effectiveComposition]);

  // Persist preference in localStorage, validated against validViews
  const [selectedChartType, setSelectedChartType] = useState<ChartType>(() => {
    if (typeof window === "undefined") return validViews[0];
    try {
      const saved = localStorage.getItem(`querex_chart_mode_${chartId}`) as ChartType | null;
      if (saved && validViews.includes(saved)) return saved;
    } catch {
      // ignore
    }
    return validViews[0];
  });

  // Ensure chartType is always valid if views change without setState in an effect
  const chartType = validViews.includes(selectedChartType) ? selectedChartType : validViews[0];

  const handleSelectType = (next: ChartType) => {
    setSelectedChartType(next);
    try {
      localStorage.setItem(`querex_chart_mode_${chartId}`, next);
    } catch {
      // ignore
    }
  };

  // Keyboard navigation & interaction states
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const [drillLabel, setDrillLabel] = useState<string | null>(null);
  const [srAnnouncement, setSrAnnouncement] = useState("");

  const activeIdx = pinnedIdx !== null ? pinnedIdx : hoveredIdx;

  // Key navigation for time series & bars
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (data.length === 0) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setHoveredIdx((prev) => {
          const next = prev === null ? 0 : Math.min(data.length - 1, prev + 1);
          setSrAnnouncement(`${data[next].label}: ${fmt(data[next].value)} ${unit}`);
          return next;
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setHoveredIdx((prev) => {
          const next = prev === null ? data.length - 1 : Math.max(0, prev - 1);
          setSrAnnouncement(`${data[next].label}: ${fmt(data[next].value)} ${unit}`);
          return next;
        });
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setPinnedIdx((prev) => (prev === hoveredIdx ? null : hoveredIdx));
      } else if (e.key === "Escape") {
        setPinnedIdx(null);
        setHoveredIdx(null);
      }
    },
    [data, unit, hoveredIdx, fmt],
  );

  // Statistics
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const max = useMemo(() => Math.max(1, ...data.map((d) => Math.max(d.value, d.compareValue ?? 0))), [data]);
  const scale = useMemo(() => niceScale(max), [max]);
  const axisMax = scale.top;
  const peak = useMemo(() => Math.max(0, ...data.map((d) => d.value)), [data]);
  const avg = useMemo(() => (data.length > 0 ? Math.round(total / data.length) : 0), [data, total]);

  // Composition data processing: Sort descending, group <3% into "Other"
  const compositionSlices = useMemo(() => {
    if (!effectiveComposition && chartType !== "donut") return [];
    if (data.length === 0) return [];

    const buckets: BucketPoint[] = isDateData ? bucketByPeriod(data) : [...data].sort((a, b) => b.value - a.value);
    const drilled = drillLabel ? buckets.find((b) => b.label === drillLabel)?.children : undefined;
    const sorted = (drilled ?? buckets).filter((d) => d.value > 0);
    const total = sorted.reduce((sum, d) => sum + d.value, 0);
    const threshold = total * 0.03;
    const mainSlices: { label: string; value: number; color: string; pct: number }[] = [];
    let otherValue = 0;

    sorted.forEach((d, i) => {
      const pct = total > 0 ? (d.value / total) * 100 : 0;
      if (!isDateData && d.value < threshold && sorted.length > 5) {
        otherValue += d.value;
      } else {
        mainSlices.push({
          label: /^\d{4}-\d{2}-\d{2}/.test(d.label) ? formatDay(d.label) : d.label,
          value: d.value,
          color: d.color || CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
          pct: Math.round(pct * 10) / 10,
        });
      }
    });

    if (otherValue > 0) {
      mainSlices.push({
        label: "Other",
        value: otherValue,
        color: "#71717a",
        pct: Math.round(((otherValue / total) * 100) * 10) / 10,
      });
    }

    return mainSlices;
  }, [data, effectiveComposition, chartType, isDateData, drillLabel]);
  const donutTotal = useMemo(() => compositionSlices.reduce((sum, sl) => sum + sl.value, 0), [compositionSlices]);
  const canDrill = isDateData && data.length > 10;
  const handleSliceClick = (label: string, i: number) => {
    if (canDrill && !drillLabel) {
      setDrillLabel(label);
      setPinnedIdx(null);
      setHoveredIdx(null);
      return;
    }
    setPinnedIdx((prev) => (prev === i ? null : i));
  };
  const exitDrill = () => {
    setDrillLabel(null);
    setPinnedIdx(null);
    setHoveredIdx(null);
  };

  // Export CSV
  const handleExportCsv = () => {
    const filename = `querex-${metricKey || chartId}-${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = ["Label", "Value", ...(data.some((d) => d.compareValue !== undefined) ? ["PreviousValue"] : [])];
    const rows = data.map((d) => [
      d.label,
      d.value,
      ...(d.compareValue !== undefined ? [d.compareValue] : []),
    ]);
    exportTableCsv({
      filename,
      title,
      dateRange,
      scope,
      headers,
      rows,
    });
  };

  // Export PNG
  const handleExportPng = () => {
    if (!containerRef.current) return;
    const filename = `querex-${metricKey || chartId}.png`;
    exportChartPng({
      container: containerRef.current,
      filename,
      title,
      dateRange,
      scope,
      legend:
        chartType === "donut"
          ? compositionSlices.map((slice) => ({
              label: slice.label,
              value: `${fmt(slice.value)}  ·  ${slice.pct}%`,
              color: slice.color,
            }))
          : undefined,
    });
  };

  // 2D SVG dimensions
  const svgWidth = 640;
  const AXIS_LEFT = 62;
  const AXIS_BOTTOM = 46;
  const n = Math.max(1, data.length);
  const gap = 3;
  const barW = Math.max(2, (svgWidth - gap * (n - 1)) / n);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="glass-card relative flex flex-col justify-between overflow-hidden rounded-xl border border-[var(--border-subtle)] p-4 shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[var(--marketing-accent)]"
      role="region"
      aria-label={`${title} chart. Use arrow keys to navigate data points.`}
    >
      {/* Screen-reader live region */}
      <span className="sr-only" aria-live="polite">
        {srAnnouncement}
      </span>

      {/* Top Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[var(--border-subtle)] pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[13.5px] font-bold text-[var(--text-primary)]">{title}</h3>
            {metricKey && (
              <button
                type="button"
                onClick={() => router.push(`/admin/analytics/${metricKey}${forwardedQuery(searchParams)}`)}
                className="rounded p-1 text-zinc-500 hover:bg-[var(--surface-2)] hover:text-zinc-200"
                title="Open dedicated analytics drilldown"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </button>
            )}
          </div>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] text-zinc-400">{subtitle}</p>
          ) : (
            <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-400">
              <span className="font-data">
                Total: <span className="font-bold text-[var(--text-primary)]">{fmt(total)}</span>
              </span>
              <span className="font-data">
                Peak: <span className="font-bold text-[var(--text-primary)]">{fmt(peak)}</span>
                {unit ? ` ${unit}` : ""}
              </span>
              <span className="font-data">
                Avg: <span className="font-bold text-[var(--text-primary)]">{fmt(avg)}</span>
              </span>
            </div>
          )}
        </div>

        {/* View Switcher Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-0.5 shadow-xs">
            {validViews.map((t) => {
              const active = chartType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleSelectType(t)}
                  className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider transition-all select-none ${
                    active
                      ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)] shadow-xs ring-1 ring-[var(--border-medium)]"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title={`Switch to ${t} chart view`}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {/* Quick Actions (CSV / PNG) */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={handleExportCsv}
              className="rounded p-1 text-zinc-500 hover:bg-[var(--surface-2)] hover:text-zinc-200"
              title="Download data as CSV"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleExportPng}
              className="rounded p-1 text-zinc-500 hover:bg-[var(--surface-2)] hover:text-zinc-200"
              title="Download chart as PNG"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Visualizer Area */}
      <div className="relative mt-3 w-full">
        {data.length === 0 ? (
          <div className="flex h-44 items-center justify-center text-xs text-zinc-500">
            No data for this period.
          </div>
        ) : chartType === "donut" ? (
          /* High-Fidelity SVG Donut with Radial Pop-out and Legend Sync */
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 py-2">
            <div className="relative flex shrink-0 items-center justify-center">
              <svg
                data-chart-svg="true"
                viewBox="0 0 200 200"
                className="h-48 w-48 select-none"
                role="img"
                aria-label={`Composition donut chart of ${title}`}
              >
                {compositionSlices.length === 0 && (
                  <circle cx={100} cy={100} r={68} fill="none" stroke="var(--border-medium)" strokeWidth={28} />
                )}
                {(() => {
                  let accAngle = 0;
                  const cx = 100;
                  const cy = 100;
                  const rOuter = 82;
                  const rInner = 54;

                  return compositionSlices.map((slice, i) => {
                    const sliceAngle = (slice.value / (donutTotal || 1)) * 360;
                    const startRad = (accAngle * Math.PI) / 180 - Math.PI / 2;
                    const endRad = ((accAngle + sliceAngle) * Math.PI) / 180 - Math.PI / 2;
                    const midRad = ((accAngle + sliceAngle / 2) * Math.PI) / 180 - Math.PI / 2;
                    accAngle += sliceAngle;

                    const isHovered = activeIdx === i;
                    const offset = isHovered ? 6 : 0;
                    const ox = Math.cos(midRad) * offset;
                    const oy = Math.sin(midRad) * offset;

                    const path = donutSlicePath(cx + ox, cy + oy, rOuter, rInner, startRad, endRad);

                    return (
                      <path
                        key={slice.label}
                        d={path}
                        fillRule="evenodd"
                        fill={slice.color}
                        stroke="var(--surface-1)"
                        strokeWidth={2}
                        opacity={activeIdx === null || isHovered ? 1 : 0.4}
                        onMouseEnter={() => setHoveredIdx(i)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        onClick={() => handleSliceClick(slice.label, i)}
                        className="cursor-pointer transition-all duration-150"
                      >
                        <title>{`${slice.label}: ${fmt(slice.value)} (${slice.pct}%)`}</title>
                      </path>
                    );
                  });
                })()}

                {/* Center Label (Hovered Slice or Total) */}
                {compositionSlices.length === 0 ? (
                  <text x="100" y="104" textAnchor="middle" className="fill-zinc-500 font-data text-[11px] font-bold uppercase tracking-wider">
                    No data
                  </text>
                ) : activeIdx !== null && compositionSlices[activeIdx] ? (
                  <g className="pointer-events-none">
                    <text x="100" y="93" textAnchor="middle" className="fill-[var(--text-primary)] font-data text-sm font-bold">
                      {fmt(compositionSlices[activeIdx].value)}
                    </text>
                    <text x="100" y="108" textAnchor="middle" className="fill-[var(--marketing-accent-text)] font-data text-[10.5px] font-bold">
                      {compositionSlices[activeIdx].pct}%
                    </text>
                    <text x="100" y="123" textAnchor="middle" className="fill-zinc-400 font-data text-[9px] uppercase tracking-wider">
                      {compositionSlices[activeIdx].label.slice(0, 12)}
                    </text>
                  </g>
                ) : (
                  <g className="pointer-events-none">
                    <text x="100" y="96" textAnchor="middle" className="fill-[var(--text-primary)] font-data text-sm font-bold">
                      {fmt(donutTotal)}
                    </text>
                    <text x="100" y="112" textAnchor="middle" className="fill-zinc-400 font-data text-[9.5px] uppercase tracking-wider">
                      Total
                    </text>
                  </g>
                )}
              </svg>
            </div>

            {/* Synchronized Donut Legend Table */}
            <div className="max-h-48 w-full min-w-[15rem] max-w-sm flex-1 space-y-1.5 overflow-y-auto pr-2 scrollbar-thin">
              {isDateData && compositionSlices.length > 0 && (
                <div className="flex items-center justify-between gap-2 px-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {drillLabel
                      ? `${unit || "Total"} by day · ${drillLabel}`
                      : `Share of ${unit || "total"} by ${data.length <= 10 ? "day" : data.length <= 120 ? "week" : "month"}`}
                  </p>
                  {drillLabel && (
                    <button
                      type="button"
                      onClick={exitDrill}
                      className="shrink-0 rounded-md border border-[var(--border-medium)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
                    >
                      ← Back
                    </button>
                  )}
                </div>
              )}
              {canDrill && !drillLabel && (
                <p className="px-2 text-[10px] text-zinc-500">Click a slice to see its days</p>
              )}
              {compositionSlices.map((s, i) => {
                const isHovered = activeIdx === i;
                return (
                  <div
                    key={s.label}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => handleSliceClick(s.label, i)}
                    className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs transition-colors cursor-pointer ${
                      isHovered
                        ? "bg-[var(--surface-2)] ring-1 ring-[var(--border-medium)]"
                        : "hover:bg-[var(--surface-2)]/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                      <span className="min-w-0 truncate font-semibold leading-tight text-[var(--text-primary)]" title={s.label}>
                        {s.label}
                      </span>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-2 whitespace-nowrap font-data tabular-nums text-zinc-300">
                      <span className="font-bold text-[var(--text-primary)]">{fmt(s.value)}</span>
                      <span className="text-[11px] text-zinc-500 w-11 text-right">{s.pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : chartType === "calendar" ? (
          /* GitHub-Style 52-Week Activity Calendar Heatmap */
          <div className="overflow-x-auto py-2 scrollbar-thin">
            <CalendarHeatmapGrid data={data} maxVal={max} unit={unit} format={fmt} />
          </div>
        ) : (
          /* 2D Line, Area, or Bar Mode */
          <div className="my-auto">
            <svg
              data-chart-svg="true"
              viewBox={`0 0 ${svgWidth + AXIS_LEFT + 8} ${height + AXIS_BOTTOM + 8}`}
              className="h-auto w-full select-none"
              role="img"
              aria-label={title}
            >
              <defs>
                <linearGradient id={`grad-${chartId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={color} stopOpacity="0.40" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.01" />
                </linearGradient>
              </defs>

              <g transform={`translate(${AXIS_LEFT} 6)`}>
              {/* Y axis: value gridlines with labels */}
              {Array.from({ length: scale.ticks + 1 }, (_, k) => 1 - k / scale.ticks).map((frac) => (
                <g key={frac}>
                  <line
                    x1="0"
                    y1={height - frac * height}
                    x2={svgWidth}
                    y2={height - frac * height}
                    stroke={frac === 0 ? "var(--border-medium)" : "var(--border-subtle)"}
                    strokeDasharray={frac === 0 ? undefined : "3 3"}
                  />
                  <text x={-8} y={height - frac * height + 5} textAnchor="end" fontSize={15} fill="currentColor" className="font-data text-zinc-500">
                    {fmt(Math.round(axisMax * frac * 100) / 100)}
                  </text>
                </g>
              ))}
              {/* X axis: date ticks + title */}
              {chartType === "area" &&
                data.map((d, i) =>
                  i % Math.max(1, Math.ceil(n / 7)) === 0 ? (
                    <text
                      key={d.label}
                      x={(i / Math.max(1, data.length - 1)) * svgWidth}
                      y={height + 21}
                      textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                      fontSize={15}
                      fill="currentColor"
                      className="font-data text-zinc-500"
                    >
                      {d.label.includes("-") ? formatDay(d.label) : d.label.slice(0, 5)}
                    </text>
                  ) : null,
                )}
              <text x={svgWidth / 2} y={height + 42} textAnchor="middle" fontSize={14} fontWeight={700} fill="currentColor" className="text-zinc-500">
                {isDateData ? "Date (UTC)" : "Category"}
              </text>

              {/* Bar View */}
              {chartType === "bar" &&
                data.map((d, i) => {
                  const h = Math.max(d.value > 0 ? 3 : 0, (d.value / axisMax) * height);
                  const x = i * (barW + gap);
                  const isHovered = activeIdx === i;
                  return (
                    <g
                      key={d.label}
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() => setPinnedIdx((prev) => (prev === i ? null : i))}
                    >
                      <rect
                        x={x}
                        y={height - h}
                        width={barW}
                        height={h}
                        rx={2}
                        fill={color}
                        opacity={activeIdx === null || isHovered ? 1 : 0.35}
                        className="cursor-pointer transition-opacity duration-150"
                      />
                      {/* Date tick labels */}
                      {i % Math.max(1, Math.ceil(n / 7)) === 0 && (
                        <text
                          x={x + barW / 2}
                          y={height + 21}
                          textAnchor="middle"
                          fontSize={15}
                          fill="currentColor"
                          className="font-data text-zinc-500"
                        >
                          {d.label.includes("-") ? formatDay(d.label) : d.label.slice(0, 5)}
                        </text>
                      )}
                    </g>
                  );
                })}

              {/* Area & Line Views */}
              {chartType === "area" && (() => {
                const points = data.map((d, i) => {
                  const x = (i / Math.max(1, data.length - 1)) * svgWidth;
                  const y = height - Math.max(3, (d.value / axisMax) * height);
                  return { x, y, d };
                });

                const linePath = points.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.y}`, "");
                const areaPath = `${linePath} L ${svgWidth} ${height} L 0 ${height} Z`;

                // Optional Comparison Series Dashed Line
                const hasCompare = data.some((d) => d.compareValue !== undefined);
                let comparePath = "";
                if (hasCompare) {
                  const compPoints = data.map((d, i) => {
                    const x = (i / Math.max(1, data.length - 1)) * svgWidth;
                    const val = d.compareValue ?? 0;
                    const y = height - Math.max(3, (val / axisMax) * height);
                    return { x, y };
                  });
                  comparePath = compPoints.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.y}`, "");
                }

                return (
                  <g>
                    {/* Comparison period curve */}
                    {hasCompare && comparePath && (
                      <path
                        d={comparePath}
                        fill="none"
                        stroke="var(--border-strong)"
                        strokeWidth={1.8}
                        strokeDasharray="4 4"
                        strokeLinecap="round"
                        opacity={0.65}
                      />
                    )}

                    {/* Gradient Area Fill */}
                    {chartType === "area" && <path d={areaPath} fill={`url(#grad-${chartId})`} />}

                    {/* Primary Curve */}
                    <path
                      d={linePath}
                      fill="none"
                      stroke={color}
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Interactive Points */}
                    {points.map((p, i) => {
                      const isHovered = activeIdx === i;
                      return (
                        <circle
                          key={p.d.label}
                          cx={p.x}
                          cy={p.y}
                          r={isHovered ? 5.5 : 2.5}
                          fill={color}
                          stroke="var(--surface-0)"
                          strokeWidth={isHovered ? 2.5 : 0}
                          onMouseEnter={() => setHoveredIdx(i)}
                          onMouseLeave={() => setHoveredIdx(null)}
                          onClick={() => setPinnedIdx((prev) => (prev === i ? null : i))}
                          className="cursor-pointer transition-all duration-100"
                        />
                      );
                    })}
                  </g>
                );
              })()}

              {/* Crosshair on Hover */}
              {activeIdx !== null && data[activeIdx] && (
                <line
                  x1={(activeIdx / Math.max(1, data.length - 1)) * svgWidth}
                  y1={0}
                  x2={(activeIdx / Math.max(1, data.length - 1)) * svgWidth}
                  y2={height}
                  stroke="var(--border-strong)"
                  strokeDasharray="3 3"
                />
              )}
              </g>
              <text
                transform={`translate(14 ${6 + height / 2}) rotate(-90)`}
                textAnchor="middle"
                fontSize={14}
                fontWeight={700}
                fill="currentColor"
                className="text-zinc-500"
              >
                {unit ? (isDateData ? `${unit} per day` : unit) : "Value"}
              </text>
            </svg>

            {/* Rich Floating Tooltip */}
            {activeIdx !== null && data[activeIdx] && (
              <div
                className="pointer-events-auto absolute z-20 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-1)]/95 px-3.5 py-2 shadow-xl backdrop-blur-md transition-all"
                style={{
                  left: `${Math.max(15, Math.min(85, (activeIdx / Math.max(1, data.length - 1)) * 100))}%`,
                  top: 8,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold text-zinc-400">
                    {data[activeIdx].label.includes("-") ? formatDay(data[activeIdx].label) : data[activeIdx].label}
                  </p>
                  {pinnedIdx === activeIdx && (
                    <button
                      type="button"
                      onClick={() => setPinnedIdx(null)}
                      className="text-[10px] text-zinc-400 hover:text-white"
                      title="Unpin tooltip (Esc)"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="mt-0.5 flex items-baseline gap-2 font-data">
                  <span className="text-[14px] font-bold text-[var(--text-primary)]">
                    {fmt(data[activeIdx].value)} {unit}
                  </span>
                  {activeIdx > 0 && (
                    <span
                      className={`text-[11px] font-bold ${
                        data[activeIdx].value >= data[activeIdx - 1].value ? "text-emerald-500" : "text-rose-500"
                      }`}
                    >
                      {data[activeIdx].value >= data[activeIdx - 1].value ? "↑" : "↓"}{" "}
                      {fmt(Math.abs(data[activeIdx].value - data[activeIdx - 1].value))}
                    </span>
                  )}
                </div>

                {data[activeIdx].compareValue !== undefined && (
                  <p className="mt-1 font-data text-[10.5px] text-zinc-500">
                    Prior window: {fmt(data[activeIdx].compareValue ?? 0)} {unit}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
