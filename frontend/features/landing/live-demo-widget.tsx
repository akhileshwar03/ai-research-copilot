"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Silent, looping recreation of the real product flow — but showing the whole
 * grounded pipeline, not just a question and answer:
 *
 *   ask → search the document → surface the matched passage → stream the
 *   cited answer.
 *
 * This is an honest, labelled illustration (not live data); it exists because
 * *showing* retrieval-grounded generation lands the product's value far harder
 * than a paragraph claiming it.
 */

interface DemoScript {
  document: string;
  question: string;
  /** The source passage, split so the matched phrase can be highlighted. */
  snippetBefore: string;
  snippetHighlight: string;
  snippetAfter: string;
  answer: string;
  page: number;
}

const SCRIPTS: DemoScript[] = [
  {
    document: "Q3-Financial-Report.pdf",
    question: "What drove the revenue increase this quarter?",
    snippetBefore: "Growth was led by enterprise renewals, with ",
    snippetHighlight: "average deal size rising 12% quarter-over-quarter",
    snippetAfter: " across the segment.",
    answer:
      "Revenue grew 18% quarter-over-quarter, driven by enterprise contract renewals and a 12% increase in average deal size.",
    page: 14,
  },
  {
    document: "Clinical-Trial-Results.pdf",
    question: "Were there any adverse events reported?",
    snippetBefore: "In total, ",
    snippetHighlight: "three mild adverse events were observed in the treatment group",
    snippetAfter: ", none deemed treatment-related.",
    answer:
      "Three mild adverse events were reported in the treatment group, none of which were classified as serious or treatment-related.",
    page: 27,
  },
  {
    document: "Market-Research-Study.pdf",
    question: "What's the primary customer objection?",
    snippetBefore: "Among respondents, ",
    snippetHighlight: "43% cited price sensitivity as their main concern",
    snippetAfter: " in the mid-market tier.",
    answer:
      "Price sensitivity was the most cited objection, mentioned by 43% of surveyed respondents in the mid-market segment.",
    page: 8,
  },
];

const RETRIEVE_MS = 1150;
const MATCH_HOLD_MS = 900;
const WORD_DELAY_MS = 52;
const HOLD_AFTER_CITATION_MS = 2400;
const PAUSE_BETWEEN_SCRIPTS_MS = 550;

type Phase = "retrieving" | "matched" | "answering" | "cited" | "resetting";

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

export function LiveDemoWidget() {
  const [scriptIndex, setScriptIndex] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [phase, setPhase] = useState<Phase>("retrieving");
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion.current) setPhase("cited");
  }, []);

  const script = SCRIPTS[scriptIndex];
  const words = script.answer.split(" ");

  useEffect(() => {
    if (reducedMotion.current) {
      setWordCount(words.length);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    if (phase === "retrieving") {
      timer = setTimeout(() => setPhase("matched"), RETRIEVE_MS);
    } else if (phase === "matched") {
      timer = setTimeout(() => {
        setWordCount(0);
        setPhase("answering");
      }, MATCH_HOLD_MS);
    } else if (phase === "answering" && wordCount < words.length) {
      timer = setTimeout(() => setWordCount((w) => w + 1), WORD_DELAY_MS);
    } else if (phase === "answering") {
      timer = setTimeout(() => setPhase("cited"), 220);
    } else if (phase === "cited") {
      timer = setTimeout(() => setPhase("resetting"), HOLD_AFTER_CITATION_MS);
    } else if (phase === "resetting") {
      timer = setTimeout(() => {
        setScriptIndex((i) => (i + 1) % SCRIPTS.length);
        setWordCount(0);
        setPhase("retrieving");
      }, PAUSE_BETWEEN_SCRIPTS_MS);
    }

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, wordCount, scriptIndex]);

  const visibleAnswer = words.slice(0, wordCount).join(" ");
  const isRetrieving = phase === "retrieving";
  const showSource = phase === "matched" || phase === "answering" || phase === "cited" || phase === "resetting";
  const showAnswer = phase === "answering" || phase === "cited" || phase === "resetting";
  const showCitation = phase === "cited" || phase === "resetting";

  return (
    <div className="relative w-full max-w-[440px]">
      {/* Breathing glow behind the card */}
      <div
        className="demo-glow pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] blur-2xl"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 40%, rgba(224,138,62,0.30), rgba(224,138,62,0.05) 70%, transparent)",
        }}
        aria-hidden
      />

      <div className="demo-sheen relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white/95 shadow-[0_30px_70px_-18px_rgba(15,23,42,0.32)] backdrop-blur">
        {/* Chrome header + grounded badge */}
        <div className="flex items-center gap-2 border-b border-black/[0.05] px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-black/10" />
            <div className="h-2.5 w-2.5 rounded-full bg-black/10" />
            <div className="h-2.5 w-2.5 rounded-full bg-black/10" />
          </div>
          <div
            key={script.document}
            className="ml-1 flex min-w-0 items-center gap-1.5 rounded-md bg-black/[0.04] px-2 py-1 text-[11px] text-zinc-600"
          >
            <DocIcon className="h-3 w-3 shrink-0" />
            <span className="truncate">{script.document}</span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-500/15">
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Grounded
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 px-4 py-5">
          {/* Question */}
          <div className="flex justify-end">
            <div
              key={`q-${scriptIndex}`}
              className="max-w-[85%] rounded-2xl rounded-tr-sm bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white"
            >
              {script.question}
            </div>
          </div>

          {/* Retrieval status row */}
          <div className="flex items-center gap-2 text-[11.5px] font-medium">
            {isRetrieving ? (
              <>
                <span
                  className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-transparent"
                  style={{ borderTopColor: "var(--marketing-accent)", borderRightColor: "var(--marketing-accent)" }}
                />
                <span className="text-zinc-500">Searching {script.document}…</span>
              </>
            ) : (
              <>
                <span
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full"
                  style={{ backgroundColor: "var(--marketing-accent)" }}
                >
                  <svg className="h-2 w-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span style={{ color: "var(--marketing-accent-text)" }}>
                  Matched passage · page {script.page}
                </span>
              </>
            )}
          </div>

          {/* Matched source snippet — the "it really read my document" moment */}
          <div
            className={[
              "overflow-hidden transition-all duration-500",
              showSource ? "max-h-40 opacity-100" : "max-h-0 opacity-0",
            ].join(" ")}
          >
            <div className="relative rounded-xl border border-black/[0.06] bg-zinc-50 p-3">
              {/* scan line while retrieving is conceptually "reading" this region */}
              <div
                className="relative rounded-lg border border-dashed border-black/[0.07] bg-white p-2.5 pl-3"
                style={{ borderLeft: "3px solid var(--marketing-accent)" }}
              >
                <p className="text-[11.5px] leading-relaxed text-zinc-500">
                  {script.snippetBefore}
                  <mark
                    className="rounded px-0.5"
                    style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
                  >
                    {script.snippetHighlight}
                  </mark>
                  {script.snippetAfter}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-400">
                <DocIcon className="h-2.5 w-2.5" />
                {script.document} · page {script.page}
              </div>
            </div>
          </div>

          {/* Answer */}
          <div
            className={[
              "flex justify-start transition-all duration-300",
              showAnswer ? "opacity-100" : "pointer-events-none h-0 opacity-0",
            ].join(" ")}
          >
            <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-zinc-100 px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-700">
              <p className="min-h-[1.2em]">
                {visibleAnswer}
                {phase === "answering" && (
                  <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] animate-pulse bg-zinc-400" />
                )}
              </p>
              <div
                className={[
                  "mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium transition-all duration-500",
                  showCitation ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
                ].join(" ")}
                style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
              >
                <DocIcon className="h-2.5 w-2.5" />
                Page {script.page}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
