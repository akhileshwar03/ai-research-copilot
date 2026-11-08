"use client";

import { useEffect, useRef, useState } from "react";

import { SENTENCE_LABELS, TONE_COLOR, countWords } from "@/features/checker/verdict";
import type { SentenceScore } from "@/services/api/checker-api";

const ARROW =
  "flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-strong)] text-[var(--text-primary)] transition-colors hover-surface";

/** One block per sentence, as wide as the sentence is long, coloured by what the model hears: the whole text at a
 *  glance. Each block jumps to that sentence. A long text gets more blocks than fit, so the strip scrolls sideways
 *  inside its box (and the arrows nudge it) instead of spilling out. */
export function SentenceMap({ sentences }: { sentences: SentenceScore[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setOverflowing(el.scrollWidth > el.clientWidth + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [sentences.length]);

  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const nudge = (direction: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduceMotion() ? "auto" : "smooth" });
  };

  const jump = (index: number) => {
    const el = document.getElementById(`sentence-${index}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  };

  return (
    <section aria-labelledby="sentence-map-title" className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 id="sentence-map-title" className="text-[14px] font-semibold text-[var(--text-primary)]">
          Sentence map
        </h3>
        {overflowing && (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-zinc-400">Scroll sideways</span>
            <button type="button" onClick={() => nudge(-1)} aria-label="Scroll the map left" className={ARROW}>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button type="button" onClick={() => nudge(1)} aria-label="Scroll the map right" className={ARROW}>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <div
        ref={scroller}
        role="group"
        aria-label="Each block is one sentence; select one to jump to it"
        className="flex h-10 min-w-0 gap-0.5 overflow-x-auto overflow-y-hidden pb-2"
      >
        {sentences.map((sentence, i) => {
          const info = SENTENCE_LABELS[sentence.label];
          return (
            <button
              key={i}
              type="button"
              onClick={() => jump(i)}
              title={`Sentence ${i + 1}: ${info.name}`}
              aria-label={`Sentence ${i + 1}: ${info.name}`}
              className="h-5 min-w-[7px] shrink rounded-[3px] transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ flex: `${Math.max(1, countWords(sentence.text))} 1 0`, backgroundColor: TONE_COLOR[sentence.label].fill }}
            />
          );
        })}
      </div>
    </section>
  );
}
