"use client";

import type { StyleGuide } from "@/services/api/paper-analyzer-api";

const STYLES: { value: StyleGuide; label: string; desc: string }[] = [
  { value: "apa", label: "APA", desc: "7th edition — 1in margins, double-spaced" },
  { value: "mla", label: "MLA", desc: "9th edition — 1in margins, double-spaced" },
  { value: "ieee", label: "IEEE", desc: "Two-column — single-spaced, justified" },
];

export function StylePicker({
  value,
  onChange,
}: {
  value: StyleGuide | null;
  onChange: (style: StyleGuide) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-[var(--text-primary)]">
        1. Choose a style guide
      </p>
      <div className="grid grid-cols-3 gap-2">
        {STYLES.map((s) => (
          <button
            key={s.value}
            onClick={() => onChange(s.value)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              value === s.value
                ? "border-transparent text-white"
                : "border-[var(--border-subtle)] text-zinc-400 hover-surface"
            }`}
            style={value === s.value ? { backgroundColor: "var(--marketing-accent)" } : undefined}
          >
            <span className="block text-[13.5px] font-semibold">{s.label}</span>
            <span className={`mt-0.5 block text-[11px] ${value === s.value ? "text-white/80" : "text-zinc-500"}`}>
              {s.desc}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
