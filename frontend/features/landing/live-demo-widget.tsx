"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Silent, looping recreation of the real product flow: a question, a
 * streamed answer, a page citation. Not live data — an honest, labelled
 * illustration of what the actual chat experience looks like, used because
 * showing the interaction beats describing it in a paragraph of copy.
 */

interface DemoScript {
  document: string;
  question: string;
  answer: string;
  page: number;
}

const SCRIPTS: DemoScript[] = [
  {
    document: "Q3-Financial-Report.pdf",
    question: "What drove the revenue increase this quarter?",
    answer:
      "Revenue grew 18% quarter-over-quarter, primarily driven by enterprise contract renewals and a 12% increase in average deal size.",
    page: 14,
  },
  {
    document: "Clinical-Trial-Results.pdf",
    question: "Were there any adverse events reported?",
    answer:
      "Three mild adverse events were reported in the treatment group, none of which were classified as serious or treatment-related.",
    page: 27,
  },
  {
    document: "Market-Research-Study.pdf",
    question: "What's the primary customer objection?",
    answer:
      "Price sensitivity was the most cited objection, mentioned by 43% of surveyed respondents in the mid-market segment.",
    page: 8,
  },
];

const WORD_DELAY_MS = 55;
const HOLD_AFTER_CITATION_MS = 2600;
const PAUSE_BETWEEN_SCRIPTS_MS = 500;

type Phase = "answering" | "cited" | "resetting";

export function LiveDemoWidget() {
  const [scriptIndex, setScriptIndex] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [phase, setPhase] = useState<Phase>("answering");
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const script = SCRIPTS[scriptIndex];
  const words = script.answer.split(" ");

  useEffect(() => {
    if (reducedMotion.current) {
      setWordCount(words.length);
      setPhase("cited");
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    if (phase === "answering" && wordCount < words.length) {
      timer = setTimeout(() => setWordCount((w) => w + 1), WORD_DELAY_MS);
    } else if (phase === "answering" && wordCount >= words.length) {
      timer = setTimeout(() => setPhase("cited"), 200);
    } else if (phase === "cited") {
      timer = setTimeout(() => setPhase("resetting"), HOLD_AFTER_CITATION_MS);
    } else if (phase === "resetting") {
      timer = setTimeout(() => {
        setScriptIndex((i) => (i + 1) % SCRIPTS.length);
        setWordCount(0);
        setPhase("answering");
      }, PAUSE_BETWEEN_SCRIPTS_MS);
    }

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, wordCount, scriptIndex]);

  const visibleAnswer = words.slice(0, wordCount).join(" ");
  const showCitation = phase === "cited" || phase === "resetting";

  return (
    <div className="w-full max-w-[420px] rounded-2xl border border-white/[0.08] bg-[#0c0c0c] shadow-2xl shadow-black/40">
      {/* Fake window chrome + document tab */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
        </div>
        <div
          key={script.document}
          className="ml-2 flex items-center gap-1.5 rounded-md bg-white/[0.05] px-2 py-1 text-[11px] text-zinc-400 transition-opacity duration-300"
        >
          <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {script.document}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex flex-col gap-3 px-4 py-5">
        <div className="flex justify-end">
          <div
            key={`q-${scriptIndex}`}
            className="max-w-[85%] rounded-2xl rounded-tr-sm bg-white px-3.5 py-2 text-[13px] font-medium text-black"
          >
            {script.question}
          </div>
        </div>

        <div className="flex justify-start">
          <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white/[0.04] px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-200">
            <p className="min-h-[3.2em]">
              {visibleAnswer}
              {phase === "answering" && (
                <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] animate-pulse bg-zinc-500" />
              )}
            </p>
            <div
              className={[
                "mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium transition-all duration-500",
                showCitation ? "opacity-100 translate-y-0" : "pointer-events-none -translate-y-1 opacity-0",
              ].join(" ")}
              style={{
                backgroundColor: "var(--marketing-accent-soft)",
                color: "var(--marketing-accent-text)",
              }}
            >
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Page {script.page}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
