"use client";

import { useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { formatDay } from "@/features/admin/components/shared";

const ThreeHudVisualizer = dynamic(
  () => import("@/features/admin/components/three-hud-visualizer").then((m) => m.ThreeHudVisualizer),
  { ssr: false, loading: () => <div className="h-full min-h-[200px] animate-pulse rounded-lg bg-[var(--surface-2)]" /> },
);

export type ChartType = "area" | "line" | "bar" | "histogram" | "scatter" | "donut" | "heatmap" | "3d";

export interface DataPoint {
  label: string; // YYYY-MM-DD
  value: number;
  compareValue?: number;
}

export function DynamicChart({
  id,
  metricKey,
  title,
  data,
  color = "var(--marketing-accent)",
  unit = "",
  height = 200,
  allow3D = true,
}: {
  id: string;
  metricKey?: string;
  title: string;
  data: DataPoint[];
  color?: string;
  unit?: string;
  height?: number;
  allow3D?: boolean;
}) {
  const router = useRouter();
  const autoId = useId();
  const chartId = id || autoId;

  // Persist user's view preference per chart
  const [chartType, setChartType] = useState<ChartType>(() => {
    if (typeof window === "undefined") return "area";
    try {
      const saved = localStorage.getItem(`querex_chart_mode_${chartId}`) as ChartType | null;
      if (saved) return saved;
    } catch {
      // localStorage may fail in restricted environments
    }
    return "area";
  });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelectType = (next: ChartType) => {
    setChartType(next);
    try {
      localStorage.setItem(`querex_chart_mode_${chartId}`, next);
    } catch {
      // ignore
    }
  };

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.value)), [data]);
  const avg = useMemo(() => (data.length > 0 ? Math.round(total / data.length) : 0), [data, total]);

  // Export to CSV
  const handleExportCsv = () => {
    const header = "Date,Value\n";
    const rows = data.map((d) => `${d.label},${d.value}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `querex-${chartId}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export to PNG (renders chart container to canvas)
  const handleExportPng = () => {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector("svg");
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        canvas.width = svg.clientWidth || 800;
        canvas.height = svg.clientHeight || 400;
        if (ctx) {
          ctx.fillStyle = "#0c0a09";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const pngUrl = canvas.toDataURL("image/png");
          const a = document.createElement("a");
          a.href = pngUrl;
          a.download = `querex-${chartId}.png`;
          a.click();
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }
  };

  const svgWidth = 640;
  const n = Math.max(1, data.length);
  const gap = 3;
  const barW = Math.max(2, (svgWidth - gap * (n - 1)) / n);

  return (
    <div
      ref={containerRef}
      className="glass-card relative flex flex-col justify-between overflow-hidden rounded-xl border border-[var(--border-subtle)] p-4 shadow-sm"
    >
      {/* Top Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[var(--border-subtle)] pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[13.5px] font-bold text-[var(--text-primary)]">{title}</h3>
            {metricKey && (
              <button
                type="button"
                onClick={() => router.push(`/admin/analytics/${metricKey}`)}
                className="rounded p-1 text-zinc-500 hover:bg-[var(--surface-2)] hover:text-zinc-200"
                title="Open dedicated analytics drilldown"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </button>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-400">
            <span className="font-data">
              Total: <span className="font-bold text-zinc-200">{total.toLocaleString()}</span>
            </span>
            <span className="font-data">
              Peak: <span className="font-bold text-zinc-200">{max.toLocaleString()}</span>/d
            </span>
            <span className="font-data">
              Avg: <span className="font-bold text-zinc-200">{avg.toLocaleString()}</span>/d
            </span>
          </div>
        </div>

        {/* View Switcher Controls */}
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-0.5 shadow-xs">
            {(["area", "line", "bar", "donut", "heatmap", ...(allow3D ? ["3d"] : [])] as ChartType[]).map((t) => {
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
                  title={`Switch to ${t} chart`}
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
              title="Download CSV"
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

      {/* Main Chart Body */}
      <div className="relative mt-3 w-full">
        {data.length === 0 ? (
          <div className="flex h-44 items-center justify-center text-xs text-zinc-500">
            No data available for this range
          </div>
        ) : chartType === "3d" ? (
          <ThreeHudVisualizer data={data} color={color} height={height} mode="bars" />
        ) : chartType === "donut" ? (
          /* SVG Donut Mode */
          <div className="flex h-52 items-center justify-center">
            <svg viewBox="0 0 160 160" className="h-44 w-44">
              {(() => {
                const totalVal = data.reduce((s, d) => s + d.value, 0) || 1;
                let accAngle = 0;
                const slices = data.slice(-8);
                return slices.map((d, i) => {
                  const slice = (d.value / totalVal) * 360;
                  const startRad = (accAngle * Math.PI) / 180;
                  const endRad = ((accAngle + slice) * Math.PI) / 180;
                  accAngle += slice;
                  const r1 = 68;
                  const r2 = 45;
                  const x1 = 80 + r1 * Math.cos(startRad);
                  const y1 = 80 + r1 * Math.sin(startRad);
                  const x2 = 80 + r1 * Math.cos(endRad);
                  const y2 = 80 + r1 * Math.sin(endRad);
                  const x3 = 80 + r2 * Math.cos(endRad);
                  const y3 = 80 + r2 * Math.sin(endRad);
                  const x4 = 80 + r2 * Math.cos(startRad);
                  const y4 = 80 + r2 * Math.sin(startRad);
                  const largeArc = slice > 180 ? 1 : 0;
                  const path = `M ${x1} ${y1} A ${r1} ${r1} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${r2} ${r2} 0 ${largeArc} 0 ${x4} ${y4} Z`;
                  return (
                    <path
                      key={d.label}
                      d={path}
                      fill={color}
                      opacity={0.3 + (i / slices.length) * 0.7}
                      stroke="var(--surface-1)"
                      strokeWidth={1.5}
                      className="transition-opacity hover:opacity-100 cursor-pointer"
                    >
                      <title>{`${d.label}: ${d.value.toLocaleString()}`}</title>
                    </path>
                  );
                });
              })()}
              <text x="80" y="78" textAnchor="middle" fill="currentColor" className="font-data text-xs font-bold text-zinc-100">
                {total.toLocaleString()}
              </text>
              <text x="80" y="92" textAnchor="middle" fill="currentColor" className="font-data text-[9px] text-zinc-500 uppercase">
                Total
              </text>
            </svg>
          </div>
        ) : chartType === "heatmap" ? (
          /* Calendar Activity Heatmap Mode */
          <div className="py-2">
            <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-10">
              {data.map((d) => {
                const intensity = max > 0 ? d.value / max : 0;
                return (
                  <div
                    key={d.label}
                    className="flex flex-col items-center rounded-lg border border-[var(--border-subtle)] p-1.5 text-center transition hover:border-[var(--border-strong)]"
                    style={{
                      backgroundColor:
                        intensity > 0.7
                          ? "rgba(217, 121, 58, 0.45)"
                          : intensity > 0.3
                            ? "rgba(217, 121, 58, 0.22)"
                            : "var(--surface-2)",
                    }}
                  >
                    <span className="text-[10px] text-zinc-400 font-data">{formatDay(d.label)}</span>
                    <span className="font-data text-[12px] font-bold text-zinc-100">{d.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* 2D Line, Area, or Bar Mode */
          <div>
            <svg
              viewBox={`0 0 ${svgWidth} ${height + 22}`}
              className="h-auto w-full select-none"
              role="img"
              aria-label={title}
            >
              {/* Defs for gradients */}
              <defs>
                <linearGradient id={`grad-${chartId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={color} stopOpacity="0.45" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="0" x2={svgWidth} y2="0" stroke="var(--border-subtle)" strokeDasharray="3 3" />
              <line x1="0" y1={height / 2} x2={svgWidth} y2={height / 2} stroke="var(--border-subtle)" strokeDasharray="3 3" />
              <line x1="0" y1={height} x2={svgWidth} y2={height} stroke="var(--border-medium)" />

              {/* Bar view */}
              {chartType === "bar" &&
                data.map((d, i) => {
                  const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * height);
                  const x = i * (barW + gap);
                  const isHovered = hoveredIdx === i;
                  return (
                    <g key={d.label} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
                      <rect
                        x={x}
                        y={height - h}
                        width={barW}
                        height={h}
                        rx={2}
                        fill={color}
                        opacity={isHovered ? 1 : 0.8}
                        className="transition-opacity duration-100 cursor-pointer"
                      />
                      {i % Math.max(1, Math.ceil(n / 7)) === 0 && (
                        <text
                          x={x + barW / 2}
                          y={height + 15}
                          textAnchor="middle"
                          fontSize={10}
                          fill="currentColor"
                          className="font-data text-zinc-500"
                        >
                          {formatDay(d.label)}
                        </text>
                      )}
                    </g>
                  );
                })}

              {/* Area & Line views */}
              {(chartType === "line" || chartType === "area") && (() => {
                const points = data.map((d, i) => {
                  const x = (i / Math.max(1, data.length - 1)) * svgWidth;
                  const y = height - Math.max(2, (d.value / max) * height);
                  return { x, y, d };
                });

                const linePath = points.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.y}`, "");
                const areaPath = `${linePath} L ${svgWidth} ${height} L 0 ${height} Z`;

                return (
                  <g>
                    {chartType === "area" && <path d={areaPath} fill={`url(#grad-${chartId})`} />}
                    <path
                      d={linePath}
                      fill="none"
                      stroke={color}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {points.map((p, i) => (
                      <circle
                        key={p.d.label}
                        cx={p.x}
                        cy={p.y}
                        r={hoveredIdx === i ? 5 : 2.5}
                        fill={color}
                        stroke="#ffffff"
                        strokeWidth={hoveredIdx === i ? 2 : 0}
                        onMouseEnter={() => setHoveredIdx(i)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        className="cursor-pointer transition-all"
                      />
                    ))}
                  </g>
                );
              })()}

              {/* Crosshair indicator */}
              {hoveredIdx !== null && data[hoveredIdx] && (
                <line
                  x1={(hoveredIdx / Math.max(1, data.length - 1)) * svgWidth}
                  y1={0}
                  x2={(hoveredIdx / Math.max(1, data.length - 1)) * svgWidth}
                  y2={height}
                  stroke="var(--border-strong)"
                  strokeDasharray="2 2"
                />
              )}
            </svg>

            {/* Hover Tooltip Card */}
            {hoveredIdx !== null && data[hoveredIdx] && (
              <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-xl border border-[var(--border-medium)] bg-[var(--surface-1)]/95 px-3 py-1.5 shadow-xl backdrop-blur-md">
                <p className="text-[11px] font-bold text-zinc-400">{formatDay(data[hoveredIdx].label)}</p>
                <p className="font-data text-[13px] font-bold text-[var(--text-primary)]">
                  {data[hoveredIdx].value.toLocaleString()} {unit}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
