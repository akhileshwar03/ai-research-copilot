"use client";

import { useState } from "react";

import { DropdownMenuContent, DropdownMenuRoot, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { HumanizeRun } from "@/services/api/humanizer-api";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function TrashIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-9-9 9 9 0 019 9z" />
    </svg>
  );
}

interface HistoryPanelProps {
  runs: HumanizeRun[];
  isLoading: boolean;
  onLoad: (run: HumanizeRun) => void;
  onDelete: (runId: number) => void;
  onDeleteAll: () => void;
}

export function HistoryPanel({ runs, isLoading, onLoad, onDelete, onDeleteAll }: HistoryPanelProps) {
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);

  return (
    <DropdownMenuRoot onOpenChange={(open) => !open && setConfirmingClearAll(false)}>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[12px] text-zinc-400 hover-surface">
          <HistoryIcon />
          History
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] p-1.5">
        <p className="px-2 pb-2 pt-1 text-[11px] leading-snug text-zinc-500">
          Your rewrites are saved here so you can revisit them — clear anytime.
        </p>
        <div className="max-h-[340px] overflow-y-auto">
          {isLoading ? (
            <p className="px-2 py-3 text-[12px] text-zinc-500">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-zinc-500">
              No runs yet — humanized text is saved here after each request.
            </p>
          ) : (
            runs.map((run) => (
              <div
                key={run.id}
                className="group flex items-start gap-2 rounded-lg px-2 py-2 hover-surface"
              >
                <button
                  onClick={() => onLoad(run)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <span
                      className="rounded px-1.5 py-0.5 font-medium"
                      style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
                    >
                      {run.style}
                    </span>
                    <span>{timeAgo(run.created_at)}</span>
                  </div>
                  <p className="mt-1 truncate text-[12px] text-[var(--text-primary)]">{run.output_text}</p>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(run.id);
                  }}
                  aria-label="Delete run"
                  className="mt-0.5 shrink-0 rounded p-1 text-zinc-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                >
                  <TrashIcon />
                </button>
              </div>
            ))
          )}
        </div>
        {runs.length > 0 && (
          <div className="mt-1 border-t border-[var(--border-subtle)] pt-1.5">
            {confirmingClearAll ? (
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="text-[11px] text-zinc-500">Delete all {runs.length} runs?</span>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => setConfirmingClearAll(false)}
                    className="rounded px-2 py-1 text-[11px] text-zinc-400 hover-surface"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      onDeleteAll();
                      setConfirmingClearAll(false);
                    }}
                    className="rounded bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/20"
                  >
                    Delete all
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingClearAll(true)}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-zinc-500 hover-surface hover:text-red-400"
              >
                <TrashIcon />
                Delete all history
              </button>
            )}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}
