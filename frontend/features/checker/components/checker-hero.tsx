"use client";

import { useEffect, useState } from "react";

import { Mark, ThreeWayBar, toneOf, TONE } from "@/features/landing/checker-story";
import { usePrefersReducedMotion } from "@/features/shared/motion/motion";

/** The head of the public page: the tagline and what the tool does on the left, a short loop of a real run on the
 *  right. The headline wears the checker's own three sentence colours, the same ones the result uses. */
const FACTS = ["Free to use", "Your text is not stored"];

/** Four of the seven sentences of one real run of the model (a casual story about moving flat). The scores are what
 *  the model returned for the whole passage, and the verdict it gave was "Likely human". */
const DEMO = [
  { text: "I ate cereal out of a mug.", p: 0.059 },
  { text: "The next morning we found the lamp in the bread bin.", p: 0.08 },
  { text: "Dan said nothing, which was the right call.", p: 0.18 },
  { text: "I'd do the whole thing again, though maybe with a kettle.", p: 0.248 },
];
const DEMO_RESULT = { human: 0.7612, mixed: 0.174, ai: 0.0648 };
const FULL_TEXT = DEMO.map((s) => s.text).join(" ");
// phase: 0 typing, 1 press Check, 2 reading, 3-6 one sentence coloured at a time, 7 verdict (held, then it starts over)
const PHASE_MS = [0, 650, 700, 600, 600, 600, 600, 3600];
const LAST_PHASE = PHASE_MS.length - 1;

/** A tiny self-playing walkthrough: text is typed in, Check is pressed, the sentences are coloured, the verdict lands. */
function HeroDemo() {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState(0);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    if (reduced) return;
    if (phase === 0) {
      let n = 0;
      const id = setInterval(() => {
        n += 4;
        if (n >= FULL_TEXT.length) {
          clearInterval(id);
          setChars(FULL_TEXT.length);
          setPhase(1);
        } else {
          setChars(n);
        }
      }, 32);
      return () => clearInterval(id);
    }
    const timer = setTimeout(() => {
      if (phase === LAST_PHASE) {
        setChars(0);
        setPhase(0);
      } else {
        setPhase(phase + 1);
      }
    }, PHASE_MS[phase]);
    return () => clearTimeout(timer);
  }, [phase, reduced]);

  const p = reduced ? LAST_PHASE : phase;
  const typing = p === 0;
  const done = p === LAST_PHASE;

  return (
    <div aria-hidden className="ml-auto max-w-[340px] rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-[0_24px_48px_-28px_rgba(40,25,10,0.35)]">
      <div className="flex items-center justify-between">
        <p className="text-[11.5px] font-semibold text-zinc-700">Try it: a real run</p>
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors duration-500"
          style={done ? { backgroundColor: TONE.human.soft, color: TONE.human.text } : { backgroundColor: "#f4f4f5", color: "#71717a" }}
        >
          {done ? "Likely human" : p >= 2 ? "Reading…" : "Your text"}
        </span>
      </div>

      <div className="mt-2.5 h-[112px] overflow-hidden rounded-lg border border-zinc-200 bg-[#fffdf8] px-3 py-2.5">
        <p className="font-reading weight-normal text-[12.5px] leading-[1.75] text-[#2a2118]">
          {typing ? (
            <>
              {FULL_TEXT.slice(0, chars)}
              <span className="ml-px inline-block h-[13px] w-px translate-y-[2px] animate-pulse bg-zinc-500" />
            </>
          ) : (
            DEMO.map((s, i) => (
              <span key={s.text}>
                <Mark tone={toneOf(s.p)} on={p >= 3 + i}>
                  {s.text}
                </Mark>{" "}
              </span>
            ))
          )}
        </p>
      </div>

      {/* The button row and the verdict share one slot, so the card never grows when the result arrives. */}
      <div className="relative mt-2.5 h-[40px]">
        <div className="absolute inset-0 flex items-center justify-between transition-opacity duration-500" style={{ opacity: done ? 0 : 1 }}>
          <span className="text-[11px] text-zinc-500">Sample text</span>
          <span
            className="rounded-md px-3 py-1 text-[11.5px] font-semibold text-white transition-transform duration-150"
            style={{ backgroundColor: "#1f7d6f", transform: p === 1 ? "scale(0.94)" : "none", opacity: typing ? 0.45 : 1 }}
          >
            {p === 2 ? "Checking…" : "Check text"}
          </span>
        </div>
        <div className="absolute inset-0 flex items-center transition-opacity duration-500" style={{ opacity: done ? 1 : 0 }}>
          <div className="w-full">
            <ThreeWayBar {...DEMO_RESULT} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CheckerHero() {
  return (
    <header id="checker-tool" className="scroll-mt-24 lg:grid lg:grid-cols-[1.25fr_0.75fr] lg:items-center lg:gap-12">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#c5691f" }}>
          Querex AI Checker
        </p>
        <h1 className="mt-3 font-headline text-[32px] font-bold leading-[1.15] tracking-tight text-[var(--text-primary)] sm:text-[38px] lg:text-[40px] xl:text-[44px]">
          Written by{" "}
          <span className="sentence-mark sentence-mark--human whitespace-nowrap rounded-md px-1.5">a person</span>,{" "}
          <span className="sentence-mark sentence-mark--ai whitespace-nowrap rounded-md px-1.5">an AI</span>, or{" "}
          <span className="sentence-mark sentence-mark--unsure whitespace-nowrap rounded-md px-1.5">both</span>?
        </h1>
        <p className="mt-4 max-w-xl text-[15.5px] leading-7 text-[var(--text-primary)] opacity-75">
          Paste text or upload a PDF and see, sentence by sentence, what reads as human and what reads as AI. When the signals are mixed, it says so instead of guessing.
        </p>
        <ul aria-label="At a glance" className="mt-5 flex flex-wrap gap-2">
          {FACTS.map((fact) => (
            <li key={fact} className="rounded-full border border-[var(--border-medium)] bg-white/60 px-3 py-1 text-[12.5px] font-medium text-[var(--text-primary)]">
              {fact}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-8 hidden lg:mt-0 lg:block">
        <HeroDemo />
      </div>
    </header>
  );
}
