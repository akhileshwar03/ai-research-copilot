"use client";

import { Fragment, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { checkerApi, type FeedbackIssue, type WritingFeedbackResult } from "@/services/api/checker-api";
import { ProbabilityGauge } from "@/features/checker/components/probability-gauge";
import { ImportControls } from "@/features/shared/components/import-controls";
import { Glare } from "@/features/shared/motion/motion";

const MAX_CHARS = 20000;

const TYPE_STYLE: Record<FeedbackIssue["type"], { label: string; color: string; badge: string }> = {
  grammar: { label: "Grammar", color: "#f87171", badge: "bg-red-500/10 text-red-300" },
  spelling: { label: "Spelling", color: "#fb923c", badge: "bg-orange-500/10 text-orange-300" },
  style: { label: "Style", color: "#a78bfa", badge: "bg-violet-500/10 text-violet-300" },
  clarity: { label: "Clarity", color: "#fbbf24", badge: "bg-amber-500/10 text-amber-300" },
  "word-choice": { label: "Word choice", color: "#38bdf8", badge: "bg-sky-500/10 text-sky-300" },
};

// Severity is a presentation layer over the real issue `type` — grammar/spelling
// are objective errors (critical), clarity/word-choice affect how the message
// lands (advisory), and style is optional polish (refinement). No new data,
// just a clearer way to triage the same real issues.
type Severity = "critical" | "advisory" | "refinement";

const TYPE_TO_SEVERITY: Record<FeedbackIssue["type"], Severity> = {
  grammar: "critical",
  spelling: "critical",
  clarity: "advisory",
  "word-choice": "advisory",
  style: "refinement",
};

const SEVERITY_STYLE: Record<Severity, { label: string; badge: string; border: string }> = {
  critical: { label: "Critical", badge: "bg-red-500/10 text-red-300", border: "border-l-red-500/50" },
  advisory: { label: "Advisory", badge: "bg-amber-500/10 text-amber-300", border: "border-l-amber-500/50" },
  refinement: { label: "Refinement", badge: "bg-sky-500/10 text-sky-300", border: "border-l-sky-500/50" },
};

const SEVERITY_ORDER: Severity[] = ["critical", "advisory", "refinement"];

function scoreColor(score: number): string {
  if (score >= 80) return "#34d399";
  if (score >= 55) return "#fbbf24";
  return "#f87171";
}

function highlightIssues(source: string, issues: FeedbackIssue[]): ReactNode {
  if (!issues.length) return source;
  const lower = source.toLowerCase();
  const ranges = issues
    .map((issue) => {
      const idx = lower.indexOf(issue.original.toLowerCase());
      return idx >= 0 ? ([idx, idx + issue.original.length, issue.type] as const) : null;
    })
    .filter((r): r is readonly [number, number, FeedbackIssue["type"]] => r !== null)
    .sort((a, b) => a[0] - b[0]);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end, type], i) => {
    if (start < cursor) return;
    if (start > cursor) nodes.push(<Fragment key={`t${i}`}>{source.slice(cursor, start)}</Fragment>);
    nodes.push(
      <mark
        key={`m${i}`}
        className="rounded px-0.5 underline decoration-2 underline-offset-2"
        style={{ backgroundColor: `${TYPE_STYLE[type].color}26`, color: TYPE_STYLE[type].color, textDecorationColor: TYPE_STYLE[type].color }}
      >
        {source.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < source.length) nodes.push(<Fragment key="tail">{source.slice(cursor)}</Fragment>);
  return nodes;
}

function ResultsRail({ result }: { result: WritingFeedbackResult }) {
  const color = scoreColor(result.overall_score);
  const severityCounts = result.issues.reduce<Record<Severity, number>>((acc, issue) => {
    const sev = TYPE_TO_SEVERITY[issue.type];
    acc[sev] = (acc[sev] ?? 0) + 1;
    return acc;
  }, { critical: 0, advisory: 0, refinement: 0 });

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <ProbabilityGauge targetPct={result.overall_score} color={color} label="Writing quality" />
        <p className="font-headline text-[16px] font-bold leading-snug text-[var(--text-primary)]">
          {result.issues.length === 0 ? "No issues found" : `${result.issues.length} issue${result.issues.length === 1 ? "" : "s"} found`}
        </p>
      </div>

      <p className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3 text-[13px] leading-relaxed text-zinc-400">
        {result.summary}
      </p>

      {result.issues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {SEVERITY_ORDER.filter((sev) => severityCounts[sev] > 0).map((sev) => (
            <span
              key={sev}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${SEVERITY_STYLE[sev].badge}`}
            >
              {severityCounts[sev]} {SEVERITY_STYLE[sev].label}
            </span>
          ))}
        </div>
      )}

      <p className="border-t border-[var(--border-subtle)] pt-3 text-[11px] leading-relaxed text-zinc-600">
        Free grammar and style pass — review suggestions before applying them; this tool doesn&apos;t verify factual
        accuracy.
      </p>
    </div>
  );
}

function IdleRail() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-2xl"
        style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3-3.75V16.5m0 0V18m0-1.5h1.5m-1.5 0H9m11.25-8.25v9a2.25 2.25 0 01-2.25 2.25h-13.5A2.25 2.25 0 013 15.75v-9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v.75m18 0h-18" />
        </svg>
      </div>
      <p className="text-[13px] font-medium text-[var(--text-primary)]">Awaiting text</p>
      <p className="max-w-[240px] text-[12px] leading-relaxed text-zinc-500">
        Paste writing and run a check. We flag real grammar, spelling, clarity, and style issues — nothing invented
        to pad the list.
      </p>
    </div>
  );
}

export function WritingFeedbackPanel() {
  const [text, setText] = useState("");
  const [analyzedText, setAnalyzedText] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (value: string) => checkerApi.writingFeedback(value),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Writing feedback failed"),
  });

  const overLimit = text.length > MAX_CHARS;

  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <Glare className="glass-card block rounded-2xl">
        <div className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-medium text-[var(--text-primary)]">Text to review</p>
            <p className={`text-[11px] ${overLimit ? "text-red-400" : "text-zinc-500"}`}>
              {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </p>
          </div>
          <div className="mb-2">
            <ImportControls onExtracted={(t) => setText(t)} />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste text here…"
            className="min-h-[340px] w-full resize-none rounded-lg border border-[var(--border-subtle)] bg-transparent p-3 text-[14px] leading-relaxed text-[var(--text-primary)] outline-none focus-accent placeholder:text-zinc-600"
          />
          <button
            onClick={() => {
              if (!text.trim() || overLimit) return;
              setAnalyzedText(text);
              mutation.mutate(text);
            }}
            disabled={!text.trim() || overLimit || mutation.isPending}
            className="mt-3 w-full rounded-lg px-3 py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: "var(--marketing-accent)" }}
          >
            {mutation.isPending ? "Reviewing…" : "Check writing"}
          </button>
        </div>
        </Glare>

        <Glare className="glass-card block self-start rounded-2xl lg:sticky lg:top-6">
        <div className="p-4">
          {mutation.isPending ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300" />
              <p className="text-[12px] text-zinc-500">Reviewing grammar, clarity, and style…</p>
            </div>
          ) : mutation.data ? (
            <ResultsRail result={mutation.data} />
          ) : (
            <IdleRail />
          )}
        </div>
        </Glare>
      </div>

      {!mutation.isPending && mutation.data && analyzedText && mutation.data.issues.length > 0 && (
        <Glare className="glass-card block rounded-2xl">
        <div className="p-4">
          <p className="mb-3 text-[13px] font-medium text-[var(--text-primary)]">Marked-up text</p>
          <p className="mb-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3 text-[13.5px] leading-relaxed whitespace-pre-wrap text-zinc-300">
            {highlightIssues(analyzedText, mutation.data.issues)}
          </p>

          <p className="mb-2 text-[13px] font-medium text-[var(--text-primary)]">Suggestions</p>
          <ul className="space-y-2">
            {[...mutation.data.issues]
              .sort((a, b) => SEVERITY_ORDER.indexOf(TYPE_TO_SEVERITY[a.type]) - SEVERITY_ORDER.indexOf(TYPE_TO_SEVERITY[b.type]))
              .map((issue, i) => {
                const severity = TYPE_TO_SEVERITY[issue.type];
                return (
                  <li
                    key={i}
                    className={`rounded-lg border border-l-[3px] border-[var(--border-subtle)] bg-[var(--surface-0)] p-3 ${SEVERITY_STYLE[severity].border}`}
                  >
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_STYLE[severity].badge}`}>
                        {SEVERITY_STYLE[severity].label}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_STYLE[issue.type].badge}`}>
                        {TYPE_STYLE[issue.type].label}
                      </span>
                    </div>
                    <p className="text-[13px] leading-relaxed">
                      <span className="text-zinc-500 line-through">{issue.original}</span>{" "}
                      <span className="text-zinc-600">→</span>{" "}
                      <span className="font-medium text-emerald-400">{issue.suggestion}</span>
                    </p>
                    <p className="mt-1 text-[12px] text-zinc-500">{issue.explanation}</p>
                  </li>
                );
              })}
          </ul>
        </div>
        </Glare>
      )}
    </>
  );
}
