"use client";

import { RESEARCH_ACTIONS, type ResearchAction } from "@/shared/types/chat";

interface ResearchActionsBarProps {
  /** Documents currently selected as sources for this session. */
  selectedCount: number;
  /** Documents the user has uploaded at all — the bar is pointless without any. */
  documentsAvailable: number;
  disabled?: boolean;
  onRun: (action: ResearchAction) => void;
}

const ICONS: Record<ResearchAction, string> = {
  summarize: "M4 6h16M4 12h10M4 18h7",
  key_findings: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  report: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  compare: "M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4",
  references: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z",
  questions: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

/**
 * One-click research tasks over the selected documents. Shown between the
 * conversation and the input so it reads as "what can I do with these
 * sources", not as another chat suggestion.
 *
 * Sits on its own glass-bar strip (matching the header/input bars) rather
 * than floating directly on the atmosphere background — without a real
 * background it read as a stray gradient smear sitting between two solid
 * bars, and the label + six pills fighting for one flex-wrap row looked
 * uneven. The label now gets its own line on narrow widths, and the pills
 * always stay on one line, scrolling horizontally instead of wrapping —
 * an earlier version switched to flex-wrap from `sm:` up, which on an
 * ordinary desktop width just traded "scrolls" for "wraps to two rows
 * anyway", not actually one line as intended.
 */
export function ResearchActionsBar({ selectedCount, documentsAvailable, disabled, onRun }: ResearchActionsBarProps) {
  if (documentsAvailable === 0) return null;
  const needsSelection = selectedCount === 0;

  return (
    <div className="glass-bar shrink-0 border-t px-4 py-2.5">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span className="shrink-0 whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
          {needsSelection ? "Select sources first" : `${selectedCount} source${selectedCount === 1 ? "" : "s"} selected`}
        </span>
        <div className="scrollbar-thin -mx-1 flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto px-1">
          {RESEARCH_ACTIONS.map((action) => {
            const tooFew = action.minDocs != null && selectedCount < action.minDocs;
            const isDisabled = disabled || needsSelection || tooFew;
            const title = needsSelection
              ? "Pick documents under Sources (top right) first"
              : tooFew
                ? `Select at least ${action.minDocs} documents to compare`
                : action.hint;
            return (
              <button
                key={action.key}
                onClick={() => onRun(action.key)}
                disabled={isDisabled}
                title={title}
                className="hover-surface flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[11.5px] font-medium text-zinc-400 transition hover:border-[var(--border-medium)] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-[var(--border-subtle)] disabled:hover:text-zinc-400"
              >
                <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[action.key]} />
                </svg>
                {action.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
