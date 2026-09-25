"use client";

import { useEffect, useRef, useState } from "react";
import {
  type DateRangePreset,
  formatRangeLabel,
  getPresetDateRange,
  parseYMD,
} from "@/features/admin/lib/date-range-utils";
import { Button, Toggle } from "@/features/admin/components/shared";

const PRESET_OPTIONS: { id: DateRangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "ytd", label: "YTD" },
  { id: "custom", label: "Custom" },
];

export function DateRangePicker({
  start,
  end,
  preset,
  compare,
  onRangeChange,
  onCompareChange,
}: {
  start: string;
  end: string;
  preset: DateRangePreset;
  compare: boolean;
  onRangeChange: (start: string, end: string, preset: DateRangePreset) => void;
  onCompareChange: (compare: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState(start);
  const [customEnd, setCustomEnd] = useState(end);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  const handleSelectPreset = (p: DateRangePreset) => {
    if (p === "custom") {
      setCustomStart(start);
      setCustomEnd(end);
      setOpen(true);
      return;
    }
    const range = getPresetDateRange(p);
    onRangeChange(range.start, range.end, p);
    setOpen(false);
  };

  const handleApplyCustom = () => {
    if (customStart && customEnd) {
      if (customStart > customEnd) {
        onRangeChange(customEnd, customStart, "custom");
      } else {
        onRangeChange(customStart, customEnd, "custom");
      }
    }
    setOpen(false);
  };

  const durationDays = Math.max(
    1,
    Math.round((parseYMD(end).getTime() - parseYMD(start).getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );

  return (
    <div ref={containerRef} className="relative inline-flex flex-wrap items-center gap-2">
      {/* Preset Pills */}
      <div className="flex items-center gap-0.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-1 shadow-xs">
        {PRESET_OPTIONS.map((item) => {
          const isActive = preset === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectPreset(item.id)}
              className={`rounded-lg px-2.5 py-1 text-[11.5px] font-bold transition-all duration-150 select-none ${
                isActive
                  ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)] shadow-xs ring-1 ring-[var(--border-medium)]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Trigger Button showing currently active range */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:border-[var(--border-medium)] hover:bg-[var(--surface-2)]"
        title="Choose custom date range"
        aria-expanded={open}
      >
        <svg className="h-4 w-4 text-[var(--marketing-accent-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.253M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
        </svg>
        <span className="font-data font-bold tracking-tight text-[var(--text-primary)]">
          {formatRangeLabel(start, end)}
        </span>
        <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-data text-[10.5px] text-zinc-400">
          {durationDays}d
        </span>
      </button>

      {/* Compare to Previous Period Toggle */}
      <div className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2.5 py-1.2 shadow-xs">
        <span className="text-[11.5px] font-semibold text-zinc-300">Compare</span>
        <Toggle checked={compare} onChange={onCompareChange} />
        {compare && (
          <span className="text-[10.5px] font-bold text-emerald-400 font-data">
            vs prior {durationDays}d
          </span>
        )}
      </div>

      {/* Custom Date Range Popover */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-1)] p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
            <h4 className="text-[13px] font-bold text-[var(--text-primary)]">Select Custom Window</h4>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              ✕
            </button>
          </div>

          <div className="mt-3.5 space-y-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Start Date (UTC)
              </label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 font-data text-[12.5px] text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[var(--marketing-accent)]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                End Date (UTC)
              </label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 font-data text-[12.5px] text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[var(--marketing-accent)]"
              />
            </div>

            <div className="pt-2 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)]">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={handleApplyCustom}>
                Apply Range
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
