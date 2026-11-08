"use client";

import { useEffect, useState } from "react";
import { TONE_COLOR, splitPercents, type Tone } from "@/features/checker/verdict";


const EXPLAIN: Record<string, string> = {
  Human: "How confident the model is that the whole text was written by a person.",
  Mixed: "How confident the model is that the text combines human and AI writing, for example AI text a person has edited.",
  AI: "How confident the model is that the whole text was written, or heavily rewritten, by an AI model.",
};

/** The model's own three-way split for the whole text. Each row opens to say what the number means. The verdict is
 *  set more cautiously than these shares. */
export function ScoreSplit({ human, mixed, ai }: { human: number; mixed: number; ai: number; words?: number }) {
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), 30);
    return () => clearTimeout(id);
  }, []);

  const [humanPct, mixedPct, aiPct] = splitPercents(human, mixed, ai);
  const parts: { name: string; tone: Tone; value: number; shown: number }[] = [
    { name: "Human", tone: "human", value: human, shown: humanPct },
    { name: "Mixed", tone: "unsure", value: mixed, shown: mixedPct },
    { name: "AI", tone: "ai", value: ai, shown: aiPct },
  ];

  return (
    <section aria-label="How the model scored this" className="space-y-3">
      <div
        role="img"
        aria-label={parts.map((p) => `${p.name} ${p.shown}%`).join(", ")}
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-[var(--surface-3)]"
      >
        {parts.map((p) => (
          <div
            key={p.name}
            className="h-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out"
            style={{ width: shown ? `${p.value * 100}%` : "0%", backgroundColor: TONE_COLOR[p.tone].fill }}
          />
        ))}
      </div>
      <p className="text-[12px] text-zinc-400">How sure the model is that the whole text is&hellip;</p>
      <ul className="space-y-1">
        {parts.map((p) => {
          const isOpen = open === p.name;
          return (
            <li key={p.name}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`split-${p.name}`}
                onClick={() => setOpen(isOpen ? null : p.name)}
                className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-[14px] transition-colors hover-surface"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: TONE_COLOR[p.tone].fill }} aria-hidden />
                <span className="flex-1 text-left text-zinc-300">{p.name}</span>
                <span className="font-data text-[16px] font-semibold text-[var(--text-primary)]">{p.shown}%</span>
                <svg
                  className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <p id={`split-${p.name}`} className="mb-1 ml-5 mt-1 border-l-2 pl-3 text-[12.5px] leading-relaxed text-zinc-400" style={{ borderColor: TONE_COLOR[p.tone].fill }}>
                  <span className="font-medium text-[var(--text-primary)]">Confidence, not a share of your sentences.</span>{" "}
                  {EXPLAIN[p.name]} The verdict above is stricter, so go by it.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
