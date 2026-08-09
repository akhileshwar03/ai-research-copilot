"use client";

import { useEffect, useState } from "react";

const SCAN_STAGES = [
  "Analyzing sentence structure…",
  "Checking word-choice patterns…",
  "Cross-referencing AI-tell phrases…",
  "Consulting the detection model…",
];

export function ScanningPanel() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    setStageIndex(0);
    const interval = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, SCAN_STAGES.length - 1));
    }, 750);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--marketing-accent)]/25" />
        <span className="absolute inline-flex h-11 w-11 animate-ping rounded-full bg-[var(--marketing-accent)]/30 [animation-delay:200ms]" />
        <span
          className="relative flex h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
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
