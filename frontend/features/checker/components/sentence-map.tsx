"use client";

import { SENTENCE_LABELS, TONE_COLOR, countWords } from "@/features/checker/verdict";
import type { SentenceScore } from "@/services/api/checker-api";

/** One block per sentence, as wide as the sentence is long, coloured by what the model hears: the whole text at a
 *  glance. Each block jumps to that sentence in the sentence view. */
export function SentenceMap({ sentences }: { sentences: SentenceScore[] }) {
  const jump = (index: number) => {
    const el = document.getElementById(`sentence-${index}`);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  };

  return (
    <section aria-labelledby="sentence-map-title" className="space-y-2">
      <h3 id="sentence-map-title" className="text-[14px] font-semibold text-[var(--text-primary)]">
        Sentence map
      </h3>
      <div role="group" aria-label="Each block is one sentence; select one to jump to it" className="flex h-5 gap-0.5">
        {sentences.map((sentence, i) => {
          const info = SENTENCE_LABELS[sentence.label];
          return (
            <button
              key={i}
              type="button"
              onClick={() => jump(i)}
              title={`Sentence ${i + 1}: ${info.name}`}
              aria-label={`Sentence ${i + 1}: ${info.name}`}
              className="min-w-[4px] rounded-[3px] transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ flex: `${Math.max(1, countWords(sentence.text))} 1 0`, backgroundColor: TONE_COLOR[sentence.label].fill }}
            />
          );
        })}
      </div>
    </section>
  );
}
