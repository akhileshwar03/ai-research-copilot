"use client";

import { useEffect, useState } from "react";
import { SENTENCE_LABELS, TONE_COLOR, type Tone } from "@/features/checker/verdict";

const pct = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 100);

/** The model's own three-way split of its estimate for the whole text, always shown. The bar grows in once on
 *  arrival. The verdict is set more cautiously than these shares, and the caption says so. */
export function ScoreSplit({ human, mixed, ai, words }: { human: number; mixed: number; ai: number; words: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), 30);
    return () => clearTimeout(id);
  }, []);

  const parts: { name: string; tone: Tone; value: number }[] = [
    { name: "Human", tone: "human", value: human },
    { name: "Mixed", tone: "unsure", value: mixed },
    { name: "AI", tone: "ai", value: ai },
  ];

  return (
    <section aria-labelledby="score-split-title" className="space-y-3">
      <h3 id="score-split-title" className="text-[14px] font-semibold text-[var(--text-primary)]">
        How the model scored this
      </h3>
      <div
        role="img"
        aria-label={parts.map((p) => `${p.name} ${pct(p.value)}%`).join(", ")}
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-[var(--surface-3)]"
      >
        {parts.map((p) => (
          <div
            key={p.name}
            className="h-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out"
            style={{ width: shown ? `${p.value * 100}%` : "0%", backgroundColor: TONE_COLOR[p.tone].fill }}
          />
        ))}
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <div key={p.name} className="flex items-baseline gap-2">
            <span
              className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
              style={{ backgroundColor: TONE_COLOR[p.tone].fill }}
              aria-hidden
            />
            <dt className="text-[12.5px] text-zinc-400">{p.name}</dt>
            <dd className="font-data text-[14px] font-semibold text-[var(--text-primary)]">{pct(p.value)}%</dd>
          </div>
        ))}
      </dl>
      <p className="text-[12px] leading-relaxed text-zinc-400">
        The model&rsquo;s own split for these {words.toLocaleString()} words. The verdict above is set more cautiously, so
        rely on it, not on these shares. {SENTENCE_LABELS.unsure.name} and Mixed are the in-between answers.
      </p>
    </section>
  );
}
