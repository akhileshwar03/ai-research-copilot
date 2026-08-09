"use client";

import { useEffect, useState } from "react";

/** One labelled, animated mini-meter for a single detection signal, with a
 *  qualitative tag so a bare number ("0.21") reads as meaning ("uniform").
 *  `tone` colours the tag: "bad" = AI-leaning, "good" = human-leaning. */
export function SignalBar({
  label,
  value,
  fill,
  tag,
  tone,
}: {
  label: string;
  value: string;
  fill: number; // 0-1
  tag: string;
  tone: "good" | "bad" | "neutral";
}) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setWidth(Math.max(0, Math.min(1, fill)) * 100), 60);
    return () => clearTimeout(id);
  }, [fill]);

  const toneColor =
    tone === "bad" ? "#f87171" : tone === "good" ? "#34d399" : "var(--marketing-accent-text)";
  const toneBg =
    tone === "bad"
      ? "bg-red-500/10 text-red-300"
      : tone === "good"
        ? "bg-emerald-500/10 text-emerald-300"
        : "bg-[var(--surface-3)] text-zinc-400";

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] text-zinc-500">{label}</p>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${toneBg}`}>{tag}</span>
      </div>
      <p className="font-data mb-2 text-[17px] font-semibold text-[var(--text-primary)]">{value}</p>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            backgroundColor: toneColor,
            transition: "width 0.7s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>
    </div>
  );
}
