"use client";

import { useMemo, useRef, useState } from "react";
import { type AnalyticsHourlyCell, ERROR_SEQUENTIAL_SCALE, SEQUENTIAL_SCALE } from "@/features/admin/lib/types";
import { exportChartPng, exportTableCsv } from "@/features/admin/lib/chart-export";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const SVG_W = 760;
const LABEL_W = 40;
const TOP = 22;
const ROW_H = 26;
const COL_W = (SVG_W - LABEL_W) / 24;
const SVG_H = TOP + 7 * ROW_H + 34;

interface HourlyCellData {
  weekday: number;
  hour: number;
  requests: number;
  errors: number;
}

export function HourlyHeatmap({
  hourly = [],
  title = "Weekday × Hour UTC Traffic Distribution",
  subtitle = "7×24 activity grid bucketed by UTC weekday and hour",
  dateRange,
  scope,
}: {
  hourly?: AnalyticsHourlyCell[];
  title?: string;
  subtitle?: string;
  dateRange?: string;
  scope?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState<"requests" | "errors">("requests");
  const [hoveredCell, setHoveredCell] = useState<HourlyCellData | null>(null);

  // Zero-fill 7x24 matrix (168 cells)
  const matrix = useMemo<HourlyCellData[][]>(() => {
    const grid: HourlyCellData[][] = [];
    for (let w = 0; w < 7; w++) {
      const row: HourlyCellData[] = [];
      for (let h = 0; h < 24; h++) {
        row.push({ weekday: w, hour: h, requests: 0, errors: 0 });
      }
      grid.push(row);
    }

    if (hourly) {
      hourly.forEach((cell) => {
        if (cell.weekday >= 0 && cell.weekday < 7 && cell.hour >= 0 && cell.hour < 24) {
          grid[cell.weekday][cell.hour].requests += cell.requests;
          grid[cell.weekday][cell.hour].errors += cell.errors;
        }
      });
    }

    return grid;
  }, [hourly]);

  // Compute maximums for color scaling
  const { maxVal, peakCell, totalRequests, totalErrors } = useMemo<{
    maxVal: number;
    peakCell: HourlyCellData | null;
    totalRequests: number;
    totalErrors: number;
  }>(() => {
    let max = 0;
    let peak: HourlyCellData | null = null;
    let reqs = 0;
    let errs = 0;

    matrix.forEach((row) => {
      row.forEach((cell) => {
        const val = metric === "requests" ? cell.requests : cell.errors;
        reqs += cell.requests;
        errs += cell.errors;
        if (val > max) {
          max = val;
          peak = cell;
        }
      });
    });

    return {
      maxVal: Math.max(1, max),
      peakCell: peak,
      totalRequests: reqs,
      totalErrors: errs,
    };
  }, [matrix, metric]);

  const handleExportCsv = () => {
    const headers = ["Weekday", "HourUTC", "Requests", "Errors", "ErrorRatePct"];
    const rows: (string | number)[][] = [];

    matrix.forEach((row) => {
      row.forEach((cell) => {
        const errRate = cell.requests > 0 ? ((cell.errors / cell.requests) * 100).toFixed(2) : "0.00";
        rows.push([
          FULL_WEEKDAYS[cell.weekday],
          `${String(cell.hour).padStart(2, "0")}:00 UTC`,
          cell.requests,
          cell.errors,
          errRate,
        ]);
      });
    });

    exportTableCsv({
      filename: `querex-hourly-traffic-${new Date().toISOString().slice(0, 10)}.csv`,
      title,
      dateRange,
      scope,
      headers,
      rows,
    });
  };

  const handleExportPng = () => {
    if (!containerRef.current) return;
    exportChartPng({
      container: containerRef.current,
      filename: "querex-hourly-heatmap.png",
      title,
      dateRange,
      scope,
    });
  };

  const currentScale = metric === "requests" ? SEQUENTIAL_SCALE : ERROR_SEQUENTIAL_SCALE;

  return (
    <div
      ref={containerRef}
      className="glass-card relative flex flex-col justify-between overflow-hidden rounded-xl border border-[var(--border-subtle)] p-4 shadow-sm"
    >
      {/* Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[13.5px] font-bold text-[var(--text-primary)]">{title}</h3>
            <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-data text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              UTC Normalized
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Requests vs Errors Metric Switcher */}
          <div className="flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => setMetric("requests")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition ${
                metric === "requests"
                  ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)] shadow-xs ring-1 ring-[var(--border-medium)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Requests ({totalRequests.toLocaleString()})
            </button>
            <button
              type="button"
              onClick={() => setMetric("errors")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition ${
                metric === "errors"
                  ? "bg-[var(--surface-2)] text-rose-400 shadow-xs ring-1 ring-[var(--border-medium)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Errors ({totalErrors.toLocaleString()})
            </button>
          </div>

          {/* Quick Actions (CSV / PNG) */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={handleExportCsv}
              className="rounded p-1 text-zinc-500 hover:bg-[var(--surface-2)] hover:text-zinc-200"
              title="Download 7x24 Matrix CSV"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleExportPng}
              className="rounded p-1 text-zinc-500 hover:bg-[var(--surface-2)] hover:text-zinc-200"
              title="Download PNG snapshot"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 7x24 Matrix Grid */}
      <div className="overflow-x-auto py-3 scrollbar-thin">
        <svg
          data-chart-svg="true"
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="h-auto w-full min-w-[620px] select-none"
          role="img"
          aria-label="Requests by UTC weekday and hour"
        >
          {Array.from({ length: 24 }).map((_, h) =>
            h % 3 === 0 ? (
              <text
                key={h}
                x={LABEL_W + h * COL_W + COL_W / 2}
                y={12}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill="currentColor"
                className="text-zinc-500"
              >
                {`${String(h).padStart(2, "0")}h`}
              </text>
            ) : null,
          )}

          {matrix.map((row, w) => (
            <g key={w}>
              <text
                x={0}
                y={TOP + w * ROW_H + ROW_H / 2 + 4}
                fontSize={11}
                fontWeight={700}
                fill="currentColor"
                className="text-zinc-500"
              >
                {WEEKDAYS[w]}
              </text>
              {row.map((cell) => {
                const val = metric === "requests" ? cell.requests : cell.errors;
                const ratio = maxVal > 0 ? val / maxVal : 0;
                let fill = "var(--surface-2)";
                if (ratio > 0.75) fill = currentScale[4];
                else if (ratio > 0.5) fill = currentScale[3];
                else if (ratio > 0.25) fill = currentScale[2];
                else if (ratio > 0.05) fill = currentScale[1];
                else if (val > 0) fill = currentScale[0];

                const active = hoveredCell?.weekday === cell.weekday && hoveredCell?.hour === cell.hour;
                return (
                  <rect
                    key={cell.hour}
                    x={LABEL_W + cell.hour * COL_W + 1}
                    y={TOP + w * ROW_H + 1}
                    width={COL_W - 2}
                    height={ROW_H - 2}
                    rx={3}
                    style={{ fill, stroke: active ? "var(--text-primary)" : "var(--border-subtle)" }}
                    strokeWidth={active ? 1.75 : 1}
                    opacity={hoveredCell && !active ? 0.6 : 1}
                    className="cursor-pointer transition-opacity"
                    onMouseEnter={() => setHoveredCell(cell)}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    <title>{`${FULL_WEEKDAYS[cell.weekday]} ${String(cell.hour).padStart(2, "0")}:00 UTC: ${cell.requests.toLocaleString()} reqs (${cell.errors} errors)`}</title>
                  </rect>
                );
              })}
            </g>
          ))}

          <g transform={`translate(${SVG_W - 250} ${TOP + 7 * ROW_H + 10})`}>
            <text x={0} y={11} fontSize={10} fontWeight={700} fill="currentColor" className="text-zinc-500">
              0
            </text>
            {["var(--surface-2)", ...currentScale].map((fill, i) => (
              <rect key={i} x={16 + i * 22} y={1} width={18} height={12} rx={3} style={{ fill, stroke: "var(--border-subtle)" }} />
            ))}
            <text x={16 + 6 * 22 + 4} y={11} fontSize={10} fontWeight={700} fill="currentColor" className="text-zinc-500">
              {maxVal.toLocaleString()}
            </text>
          </g>
        </svg>
      </div>

      {/* Heatmap Footer: Live Readout & Intensity Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-2.5 text-[11px] text-zinc-400">
        <div>
          {hoveredCell ? (
            <span className="font-data">
              <strong className="text-[var(--text-primary)]">
                {FULL_WEEKDAYS[hoveredCell.weekday]} {String(hoveredCell.hour).padStart(2, "0")}:00 UTC
              </strong>
              : <span className="font-bold text-[var(--marketing-accent-text)]">{hoveredCell.requests.toLocaleString()}</span> requests ·{" "}
              <span className={hoveredCell.errors > 0 ? "font-bold text-rose-500" : "text-zinc-500"}>
                {hoveredCell.errors} errors
              </span>
            </span>
          ) : peakCell ? (
            <span className="font-data">
              Peak UTC Window:{" "}
              <strong className="text-[var(--text-primary)]">
                {FULL_WEEKDAYS[peakCell.weekday]} {String(peakCell.hour).padStart(2, "0")}:00 UTC
              </strong>{" "}
              ({(metric === "requests" ? peakCell.requests : peakCell.errors).toLocaleString()} {metric})
            </span>
          ) : (
            <span>Hover a cell to inspect hourly telemetry</span>
          )}
        </div>

      </div>
    </div>
  );
}
