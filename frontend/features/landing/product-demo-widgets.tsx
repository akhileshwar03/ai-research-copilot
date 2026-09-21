"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Four looping, honest, labelled illustrations of each remaining product's
 * real flow — the same idea as LiveDemoWidget (Research Copilot's hero
 * demo), extended to the other four landing sections, which previously each
 * showed one frozen static mockup instead of an animated one. Not live data;
 * each script is representative of the real product behaviour it depicts.
 */

const CARD_SHELL =
  "overflow-hidden rounded-2xl border border-black/[0.06] bg-white/95 shadow-[0_30px_70px_-18px_rgba(15,23,42,0.32)] backdrop-blur";

function DotsHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-black/[0.05] px-4 py-3">
      <div className="flex gap-1.5">
        <div className="h-2.5 w-2.5 rounded-full bg-black/10" />
        <div className="h-2.5 w-2.5 rounded-full bg-black/10" />
        <div className="h-2.5 w-2.5 rounded-full bg-black/10" />
      </div>
      {children}
    </div>
  );
}

function useReducedMotion() {
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
  return reduced;
}

// ─── Humanizer ──────────────────────────────────────────────────────────────

interface HumanizerScript {
  before: string;
  beforeWords: number;
  after: string;
  afterWords: number;
  afterHighlights: string[];
  scoreBefore: number;
  scoreAfter: number;
}

const HUMANIZER_SCRIPTS: HumanizerScript[] = [
  {
    before: "Artificial intelligence systems have revolutionized numerous industries.",
    beforeWords: 22,
    after: "AI has genuinely changed how a lot of industries get work done.",
    afterWords: 13,
    afterHighlights: ["genuinely changed", "get work done"],
    scoreBefore: 94,
    scoreAfter: 3,
  },
  {
    before: "It is important to note that leveraging synergies can significantly enhance organizational productivity.",
    beforeWords: 15,
    after: "Teams get more done when they actually work together — it's that simple.",
    afterWords: 14,
    afterHighlights: ["actually work together", "that simple"],
    scoreBefore: 89,
    scoreAfter: 6,
  },
  {
    before: "In today's fast-paced digital landscape, businesses must adapt quickly to remain competitive.",
    beforeWords: 14,
    after: "Businesses that can't adapt fast get left behind now — that's just how it works.",
    afterWords: 15,
    afterHighlights: ["get left behind", "just how it works"],
    scoreBefore: 91,
    scoreAfter: 4,
  },
];

type HumanizerPhase = "showing" | "rewriting" | "revealed";

export function HumanizerDemoWidget() {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<HumanizerPhase>("showing");
  const reduced = useReducedMotion();
  const script = HUMANIZER_SCRIPTS[i];

  useEffect(() => {
    if (reduced.current) {
      setPhase("revealed");
      return;
    }
    const t =
      phase === "showing"
        ? setTimeout(() => setPhase("rewriting"), 1400)
        : phase === "rewriting"
          ? setTimeout(() => setPhase("revealed"), 1100)
          : setTimeout(() => {
              setPhase("showing");
              setI((n) => (n + 1) % HUMANIZER_SCRIPTS.length);
            }, 3200);
    return () => clearTimeout(t);
  }, [phase, reduced]);

  const accentSoft = "#b6446a1f";
  const accentText = "#8f3453";

  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] blur-2xl"
        style={{ background: "radial-gradient(60% 55% at 50% 40%, rgba(182,68,106,0.24), transparent 70%)" }}
        aria-hidden
      />
      <div className={CARD_SHELL}>
        <DotsHeader>
          <span className="ml-1 text-[11px] font-medium text-zinc-500">Humanizer</span>
          <span
            className={[
              "ml-auto rounded-full px-2 py-1 text-[10px] font-semibold transition-opacity duration-300",
              phase === "rewriting" ? "opacity-50" : "opacity-100",
            ].join(" ")}
            style={{ backgroundColor: accentSoft, color: accentText }}
          >
            {phase === "revealed" ? "Rewritten" : "Original"}
          </span>
        </DotsHeader>
        <div className="px-4 py-5">
          <p className="text-[11.5px] font-medium uppercase tracking-wide text-zinc-400">
            {phase === "rewriting" ? "Rewriting…" : phase === "revealed" ? "Rewritten" : "Original"}
          </p>
          <div className="relative mt-2 min-h-[3.6em]">
            <p
              className={[
                "text-[13.5px] leading-relaxed text-zinc-700 transition-opacity duration-300",
                phase === "showing" ? "opacity-100" : "absolute inset-0 opacity-0",
              ].join(" ")}
            >
              {script.before}
            </p>
            <p
              className={[
                "text-[13.5px] leading-relaxed text-zinc-700 transition-opacity duration-500",
                phase === "revealed" ? "opacity-100" : "absolute inset-0 opacity-0",
              ].join(" ")}
            >
              {script.after.split(/(\s+)/).map((word, idx) => {
                const isHighlighted = script.afterHighlights.some((h) => h.includes(word.trim()) && word.trim());
                return isHighlighted ? (
                  <mark key={idx} className="rounded px-0.5" style={{ backgroundColor: accentSoft, color: accentText }}>
                    {word}
                  </mark>
                ) : (
                  <span key={idx}>{word}</span>
                );
              })}
            </p>
            {phase === "rewriting" && (
              <div className="absolute inset-0 flex items-center gap-2 text-[12px] text-zinc-400">
                <span
                  className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-transparent"
                  style={{ borderTopColor: "#b6446a", borderRightColor: "#b6446a" }}
                />
                Rewriting, word by word…
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-black/[0.05] pt-3">
            <span className="text-[11px] text-zinc-400">
              {script.beforeWords} → {phase === "revealed" ? script.afterWords : "…"} words
            </span>
            <span
              className={[
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 transition-colors duration-500",
                phase === "revealed"
                  ? "bg-emerald-50 text-emerald-600 ring-emerald-500/15"
                  : "bg-red-50 text-red-600 ring-red-500/15",
              ].join(" ")}
            >
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Predicted AI score: {phase === "revealed" ? script.scoreAfter : script.scoreBefore}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI Checker ─────────────────────────────────────────────────────────────

interface CheckerScript {
  percent: number;
  verdict: string;
  tone: "bad" | "warn" | "good";
  passage: string;
  flagStart: number;
  flagEnd: number;
}

const CHECKER_SCRIPTS: CheckerScript[] = [
  {
    percent: 94,
    verdict: "AI-generated",
    tone: "bad",
    passage:
      "In today's rapidly evolving landscape, it is important to note that organizations must leverage cutting-edge solutions to stay competitive.",
    flagStart: 43,
    flagEnd: 115,
  },
  {
    percent: 8,
    verdict: "Likely human",
    tone: "good",
    passage: "Honestly, the whole thing took longer than I expected — mostly because I kept rewriting the intro.",
    flagStart: 0,
    flagEnd: 0,
  },
  {
    percent: 61,
    verdict: "Possibly AI",
    tone: "warn",
    passage: "The results demonstrate a significant improvement, thereby validating the proposed methodology.",
    flagStart: 27,
    flagEnd: 55,
  },
];

const TONE_COLORS: Record<CheckerScript["tone"], { ring: string; badgeBg: string; badgeText: string; mark: string }> = {
  bad: { ring: "#e0574f", badgeBg: "bg-red-50", badgeText: "text-red-600", mark: "bg-red-100 text-red-700" },
  warn: { ring: "#c9a227", badgeBg: "bg-amber-50", badgeText: "text-amber-600", mark: "bg-amber-100 text-amber-700" },
  good: { ring: "#1f9d6f", badgeBg: "bg-emerald-50", badgeText: "text-emerald-600", mark: "bg-emerald-100 text-emerald-700" },
};

type CheckerPhase = "scanning" | "revealed";

export function AICheckerDemoWidget() {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<CheckerPhase>("scanning");
  const [dial, setDial] = useState(0);
  const reduced = useReducedMotion();
  const script = CHECKER_SCRIPTS[i];
  const colors = TONE_COLORS[script.tone];

  useEffect(() => {
    if (reduced.current) {
      setPhase("revealed");
      setDial(script.percent);
      return;
    }
    if (phase === "scanning") {
      const t = setTimeout(() => setPhase("revealed"), 1300);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setPhase("scanning");
      setDial(0);
      setI((n) => (n + 1) % CHECKER_SCRIPTS.length);
    }, 3200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reduced]);

  useEffect(() => {
    if (phase !== "revealed" || reduced.current) return;
    if (dial >= script.percent) return;
    const t = setTimeout(() => setDial((d) => Math.min(script.percent, d + 2)), 14);
    return () => clearTimeout(t);
  }, [phase, dial, script.percent, reduced]);

  const circumference = 2 * Math.PI * 42;

  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] blur-2xl"
        style={{ background: "radial-gradient(60% 55% at 50% 40%, rgba(31,125,111,0.22), transparent 70%)" }}
        aria-hidden
      />
      <div className={CARD_SHELL}>
        <DotsHeader>
          <span className="ml-1 text-[11px] font-medium text-zinc-500">AI Checker</span>
          <span className="ml-auto rounded-full bg-[#1f7d6f1f] px-2 py-1 text-[10px] font-semibold text-[#145c51]">
            {phase === "scanning" ? "Scanning…" : "Advanced Scan"}
          </span>
        </DotsHeader>
        <div className="flex flex-col items-center gap-3 px-4 py-6">
          <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke={colors.ring}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${circumference * (dial / 100)} ${circumference}`}
              style={{ transition: "stroke-dasharray 0.1s linear" }}
            />
          </svg>
          <div className="-mt-16 text-center">
            <span className="font-mono text-2xl font-bold text-zinc-900">{dial}%</span>
          </div>
          <span
            className={[
              "mt-8 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 transition-opacity duration-300",
              colors.badgeBg,
              colors.badgeText,
              "ring-current/15",
              phase === "revealed" ? "opacity-100" : "opacity-0",
            ].join(" ")}
          >
            {script.verdict}
          </span>
          <div className="mt-2 w-full rounded-xl border border-black/[0.06] bg-zinc-50 p-3 text-[12px] leading-relaxed text-zinc-500">
            {script.flagStart === script.flagEnd ? (
              script.passage
            ) : (
              <>
                {script.passage.slice(0, script.flagStart)}
                <mark className={`rounded px-0.5 ${colors.mark}`}>
                  {script.passage.slice(script.flagStart, script.flagEnd)}
                </mark>
                {script.passage.slice(script.flagEnd)}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Real-time AI ───────────────────────────────────────────────────────────

interface RealtimeScript {
  question: string;
  answer: string;
  sources: string[];
}

const REALTIME_SCRIPTS: RealtimeScript[] = [
  {
    question: "What's the latest stable Next.js release?",
    answer: "Next.js 16.2, released this month, with faster Turbopack builds and improved caching.",
    sources: ["[1] Next.js Blog", "[2] Vercel", "[3] GitHub Releases"],
  },
  {
    question: "Who won the last F1 constructors' title?",
    answer: "The title was decided in the final race of the season, coming down to a handful of points.",
    sources: ["[1] Formula1.com", "[2] Reuters", "[3] BBC Sport"],
  },
  {
    question: "Is there a new inflation report out this week?",
    answer: "Yes — the latest CPI figures were released this week, showing a slight month-over-month cooldown.",
    sources: ["[1] Bureau of Labor Statistics", "[2] Reuters"],
  },
];

type RealtimePhase = "searching" | "answering" | "cited" | "resetting";

export function RealtimeDemoWidget() {
  const [i, setI] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [phase, setPhase] = useState<RealtimePhase>("searching");
  const reduced = useReducedMotion();
  const script = REALTIME_SCRIPTS[i];
  const words = script.answer.split(" ");

  useEffect(() => {
    if (reduced.current) {
      setWordCount(words.length);
      setPhase("cited");
      return;
    }
    let t: ReturnType<typeof setTimeout>;
    if (phase === "searching") {
      t = setTimeout(() => {
        setWordCount(0);
        setPhase("answering");
      }, 1100);
    } else if (phase === "answering" && wordCount < words.length) {
      t = setTimeout(() => setWordCount((w) => w + 1), 45);
    } else if (phase === "answering") {
      t = setTimeout(() => setPhase("cited"), 200);
    } else if (phase === "cited") {
      t = setTimeout(() => setPhase("resetting"), 2400);
    } else {
      t = setTimeout(() => {
        setI((n) => (n + 1) % REALTIME_SCRIPTS.length);
        setWordCount(0);
        setPhase("searching");
      }, 500);
    }
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, wordCount, reduced]);

  const visibleAnswer = words.slice(0, wordCount).join(" ");
  const isSearching = phase === "searching";
  const showAnswer = phase === "answering" || phase === "cited" || phase === "resetting";
  const showSources = phase === "cited" || phase === "resetting";
  const accentSoft = "#4457c91f";
  const accentText = "#33409e";

  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] blur-2xl"
        style={{ background: "radial-gradient(60% 55% at 50% 40%, rgba(68,87,201,0.22), transparent 70%)" }}
        aria-hidden
      />
      <div className={CARD_SHELL}>
        <DotsHeader>
          <span className="ml-1 text-[11px] font-medium text-zinc-500">Real-time AI</span>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-500/15">
            <span className={["h-1.5 w-1.5 rounded-full bg-emerald-500", isSearching ? "animate-pulse" : ""].join(" ")} />
            {isSearching ? "Searching…" : "Live search"}
          </span>
        </DotsHeader>
        <div className="flex flex-col gap-3 px-4 py-5">
          <div className="flex justify-end">
            <div
              key={`q-${i}`}
              className="max-w-[85%] rounded-2xl rounded-tr-sm bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white"
            >
              {script.question}
            </div>
          </div>
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
            </div>
          </div>
          <div
            className={[
              "flex flex-wrap gap-1.5 pl-1 transition-all duration-500",
              showSources ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
            ].join(" ")}
          >
            {script.sources.map((src) => (
              <span
                key={src}
                className="rounded-full px-2 py-1 text-[10.5px] font-medium"
                style={{ backgroundColor: accentSoft, color: accentText }}
              >
                {src}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Paper Analyzer ─────────────────────────────────────────────────────────

interface PaperScript {
  style: string;
  score: number;
  rows: { label: string; ok: boolean }[];
}

const PAPER_SCRIPTS: PaperScript[] = [
  {
    style: "APA",
    score: 91,
    rows: [
      { label: "Margins", ok: true },
      { label: "Line spacing", ok: true },
      { label: "Font", ok: true },
      { label: "Page numbering", ok: false },
    ],
  },
  {
    style: "MLA",
    score: 97,
    rows: [
      { label: "Margins", ok: true },
      { label: "Line spacing", ok: true },
      { label: "Font", ok: true },
      { label: "Header format", ok: true },
    ],
  },
  {
    style: "IEEE",
    score: 78,
    rows: [
      { label: "Margins", ok: false },
      { label: "Column layout", ok: true },
      { label: "Font", ok: true },
      { label: "Citation format", ok: false },
    ],
  },
];

type PaperPhase = "scanning" | "checking" | "revealed";

export function PaperAnalyzerDemoWidget() {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<PaperPhase>("scanning");
  const [dial, setDial] = useState(0);
  const [rowsShown, setRowsShown] = useState(0);
  const reduced = useReducedMotion();
  const script = PAPER_SCRIPTS[i];

  useEffect(() => {
    if (reduced.current) {
      setPhase("revealed");
      setDial(script.score);
      setRowsShown(script.rows.length);
      return;
    }
    if (phase === "scanning") {
      const t = setTimeout(() => setPhase("checking"), 900);
      return () => clearTimeout(t);
    }
    if (phase === "checking" && rowsShown < script.rows.length) {
      const t = setTimeout(() => setRowsShown((r) => r + 1), 380);
      return () => clearTimeout(t);
    }
    if (phase === "checking") {
      const t = setTimeout(() => setPhase("revealed"), 200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setPhase("scanning");
      setDial(0);
      setRowsShown(0);
      setI((n) => (n + 1) % PAPER_SCRIPTS.length);
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, rowsShown, reduced]);

  useEffect(() => {
    if (phase !== "revealed" || reduced.current) return;
    if (dial >= script.score) return;
    const t = setTimeout(() => setDial((d) => Math.min(script.score, d + 2)), 12);
    return () => clearTimeout(t);
  }, [phase, dial, script.score, reduced]);

  const circumference = 2 * Math.PI * 42;
  const accent = "#7c4fb0";

  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] blur-2xl"
        style={{ background: "radial-gradient(60% 55% at 50% 40%, rgba(124,79,176,0.22), transparent 70%)" }}
        aria-hidden
      />
      <div className={CARD_SHELL}>
        <DotsHeader>
          <span className="ml-1 text-[11px] font-medium text-zinc-500">Paper Analyzer</span>
          <span className="ml-auto rounded-full bg-[#7c4fb01f] px-2 py-1 text-[10px] font-semibold text-[#5f3a8a]">
            {phase === "scanning" ? "Reading PDF…" : script.style}
          </span>
        </DotsHeader>
        <div className="flex flex-col items-center gap-3 px-4 py-5">
          <svg viewBox="0 0 100 100" className="h-20 w-20 -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke={accent}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${circumference * (dial / 100)} ${circumference}`}
              style={{ transition: "stroke-dasharray 0.1s linear" }}
            />
          </svg>
          <div className="-mt-14 text-center">
            <span className="font-mono text-xl font-bold text-zinc-900">{dial}</span>
          </div>
          <div className="mt-2 w-full space-y-1.5">
            {script.rows.map((row, idx) => {
              const shown = idx < rowsShown || phase === "revealed";
              const checking = idx === rowsShown - 1 && phase === "checking";
              return (
                <div
                  key={row.label}
                  className={[
                    "flex items-center justify-between rounded-lg border border-black/[0.05] bg-zinc-50 px-2.5 py-1.5 text-[11px] transition-opacity duration-300",
                    idx < rowsShown ? "opacity-100" : "opacity-0",
                  ].join(" ")}
                >
                  <span className="text-zinc-600">{row.label}</span>
                  {shown && !checking ? (
                    <span
                      className={
                        row.ok
                          ? "rounded-full bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-600"
                          : "rounded-full bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-600"
                      }
                    >
                      {row.ok ? "Pass" : "Warning"}
                    </span>
                  ) : (
                    <span
                      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-transparent"
                      style={{ borderTopColor: accent, borderRightColor: accent }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
