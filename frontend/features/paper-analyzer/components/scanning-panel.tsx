"use client";

import { useEffect, useState } from "react";

const SCAN_STAGES = [
  "Reading page geometry…",
  "Measuring margins and spacing…",
  "Checking font and alignment…",
  "Scoring against the style guide…",
];

export function ScanningPanel() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, SCAN_STAGES.length - 1));
    }, 650);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--marketing-accent)]/25" />
        <span
          className="relative flex h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 9h15M4.5 15h15" />
          </svg>
        </span>
      </div>
      <p className="text-[13px] font-medium text-[var(--text-primary)]">{SCAN_STAGES[stageIndex]}</p>
      <div className="flex gap-1.5">
        {SCAN_STAGES.map((_, i) => (
          <span
            key={i}
            className="h-1 w-6 rounded-full transition-colors duration-300"
            style={{ backgroundColor: i <= stageIndex ? "var(--marketing-accent)" : "var(--border-subtle)" }}
          />
        ))}
      </div>
    </div>
  );
}
