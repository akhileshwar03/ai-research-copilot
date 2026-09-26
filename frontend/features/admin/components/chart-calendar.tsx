"use client";

import { useMemo, useState } from "react";
import { formatDay } from "@/features/admin/components/shared";
import { SEQUENTIAL_SCALE } from "@/features/admin/lib/types";
import type { ChartDataPoint as DataPoint } from "@/features/admin/lib/chart-types";

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_LAYOUT_MAX_DAYS = 45;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface CalendarCell {
  date: string;
  value: number;
}

/** Days grouped into Monday-first weeks; days outside the data range are null. */
function buildWeeks(points: DataPoint[]): (CalendarCell | null)[][] {
  const weeks: (CalendarCell | null)[][] = [];
  let row: (CalendarCell | null)[] = new Array(7).fill(null);
  for (const point of points) {
    const weekday = (new Date(`${point.label}T00:00:00Z`).getUTCDay() + 6) % 7;
    row[weekday] = { date: point.label, value: point.value };
    if (weekday === 6) {
      weeks.push(row);
      row = new Array(7).fill(null);
    }
  }
  if (row.some(Boolean)) weeks.push(row);
  return weeks;
}

/** Intensity bucket 0-4 for a value, or -1 for no activity. */
function intensityBucket(value: number, peak: number): number {
  if (value <= 0) return -1;
  const ratio = peak > 0 ? value / peak : 0;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  if (ratio > 0.05) return 1;
  return 0;
}

const bucketFill = (bucket: number) => (bucket < 0 ? "var(--surface-2)" : SEQUENTIAL_SCALE[bucket]);
const onStrongFill = (bucket: number) => bucket >= 3;

/**
 * Activity calendar. Short ranges render as a month-style calendar (weeks as rows, day numbers and values
 * inside each day); long ranges as a compact year-style grid (weeks as columns).
 */
export function CalendarHeatmapGrid({
  data,
  maxVal,
  unit,
  format,
}: {
  data: DataPoint[];
  maxVal: number;
  unit?: string;
  format: (value: number) => string;
}) {
  const [hovered, setHovered] = useState<CalendarCell | null>(null);
  const weeks = useMemo(() => buildWeeks(data), [data]);
  const periodTotal = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);
  const monthLayout = data.length <= MONTH_LAYOUT_MAX_DAYS;

  const legend = (x: number, y: number) => (
    <g transform={`translate(${x} ${y})`}>
      <text x={0} y={10} fontSize={9} fontWeight={700} fill="currentColor" className="text-zinc-500">
        Less
      </text>
      {[-1, 0, 1, 2, 3, 4].map((bucket, i) => (
        <rect
          key={bucket}
          x={28 + i * 15}
          y={1}
          width={12}
          height={12}
          rx={3}
          style={{ fill: bucketFill(bucket), stroke: "var(--border-subtle)" }}
        />
      ))}
      <text x={28 + 6 * 15 + 4} y={10} fontSize={9} fontWeight={700} fill="currentColor" className="text-zinc-500">
        More
      </text>
    </g>
  );

  const readout = (
    <div className="min-h-5 text-center text-[11px] text-zinc-500" aria-live="polite">
      {hovered ? (
        <span className="font-data">
          <strong className="text-[var(--text-primary)]">
            {formatDay(hovered.date)} ({WEEKDAY_FULL[(new Date(`${hovered.date}T00:00:00Z`).getUTCDay() + 6) % 7]})
          </strong>
          : <strong className="text-[var(--marketing-accent-text)]">{format(hovered.value)} {unit}</strong>
          {periodTotal > 0 && ` · ${((hovered.value / periodTotal) * 100).toFixed(1)}% of the period`}
        </span>
      ) : (
        <span>Hover a day for details</span>
      )}
    </div>
  );

  if (monthLayout) {
    const cellW = 54;
    const cellH = 36;
    const gap = 6;
    const head = 22;
    const width = 7 * cellW + 6 * gap;
    const height = head + weeks.length * (cellH + gap) + 24;
    return (
      <div className="flex flex-col gap-1.5">
        <svg
          data-chart-svg="true"
          viewBox={`0 0 ${width} ${height}`}
          className="mx-auto h-auto w-full max-w-[460px] select-none"
          role="img"
          aria-label={`Activity calendar, ${data.length} days`}
        >
          {WEEKDAY_NAMES.map((name, i) => (
            <text
              key={name}
              x={i * (cellW + gap) + cellW / 2}
              y={13}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill="currentColor"
              className="text-zinc-500"
            >
              {name}
            </text>
          ))}
          {weeks.flatMap((week, w) =>
            week.map((cell, i) => {
              const x = i * (cellW + gap);
              const y = head + w * (cellH + gap);
              if (!cell) {
                return (
                  <rect
                    key={`${w}-${i}`}
                    x={x}
                    y={y}
                    width={cellW}
                    height={cellH}
                    rx={6}
                    style={{ fill: "none", stroke: "var(--border-subtle)", strokeDasharray: "3 3" }}
                  />
                );
              }
              const bucket = intensityBucket(cell.value, maxVal);
              const dayNumber = Number(cell.date.slice(8, 10));
              const strong = onStrongFill(bucket);
              const active = hovered?.date === cell.date;
              const textFill = strong ? "#ffffff" : "var(--text-primary)";
              return (
                <g
                  key={cell.date}
                  className="cursor-pointer"
                  opacity={hovered && !active ? 0.55 : 1}
                  onMouseEnter={() => setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <rect
                    x={x}
                    y={y}
                    width={cellW}
                    height={cellH}
                    rx={6}
                    style={{ fill: bucketFill(bucket), stroke: active ? "var(--text-primary)" : "var(--border-subtle)" }}
                    strokeWidth={active ? 1.75 : 1}
                  />
                  <text x={x + 6} y={y + 12} fontSize={9} fontWeight={700} style={{ fill: textFill }} opacity={0.7}>
                    {dayNumber === 1 ? `${MONTHS[Number(cell.date.slice(5, 7)) - 1]} 1` : dayNumber}
                  </text>
                  {cell.value > 0 && (
                    <text x={x + cellW - 6} y={y + cellH - 8} textAnchor="end" fontSize={12} fontWeight={800} style={{ fill: textFill }}>
                      {format(cell.value)}
                    </text>
                  )}
                  <title>{`${cell.date}: ${format(cell.value)} ${unit ?? ""}`}</title>
                </g>
              );
            }),
          )}
          {legend(width - 28 - 6 * 15 - 30, height - 18)}
        </svg>
        {readout}
      </div>
    );
  }

  const cell = 11;
  const step = 14;
  const left = 30;
  const top = 20;
  const width = left + weeks.length * step + 4;
  const height = top + 7 * step + 26;
  return (
    <div className="flex flex-col gap-1.5">
      <svg
        data-chart-svg="true"
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`Activity calendar, ${data.length} days`}
      >
        {[0, 2, 4, 6].map((row) => (
          <text key={row} x={0} y={top + row * step + cell - 2} fontSize={8} fontWeight={700} fill="currentColor" className="text-zinc-500">
            {WEEKDAY_NAMES[row]}
          </text>
        ))}
        {weeks.map((week, w) => {
          const first = week.find(Boolean) as CalendarCell;
          const month = Number(first.date.slice(5, 7)) - 1;
          const prevFirst = weeks[w - 1]?.find(Boolean);
          const showMonth = !prevFirst || Number(prevFirst.date.slice(5, 7)) - 1 !== month;
          return (
            <g key={first.date} transform={`translate(${left + w * step} 0)`}>
              {showMonth && (
                <text x={0} y={12} fontSize={8.5} fontWeight={700} fill="currentColor" className="text-zinc-500">
                  {MONTHS[month]}
                </text>
              )}
              {week.map((day, i) => {
                if (!day) return null;
                const active = hovered?.date === day.date;
                return (
                  <rect
                    key={day.date}
                    x={0}
                    y={top + i * step}
                    width={cell}
                    height={cell}
                    rx={2.5}
                    style={{ fill: bucketFill(intensityBucket(day.value, maxVal)), stroke: active ? "var(--text-primary)" : "var(--border-subtle)" }}
                    strokeWidth={active ? 1.5 : 0.8}
                    opacity={hovered && !active ? 0.55 : 1}
                    className="cursor-pointer"
                    onMouseEnter={() => setHovered(day)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <title>{`${day.date}: ${format(day.value)} ${unit ?? ""}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
        {legend(width - 28 - 6 * 15 - 30, height - 16)}
      </svg>
      {readout}
    </div>
  );
}
