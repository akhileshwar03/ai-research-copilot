"use client";

import type { SystemInsight } from "@/features/admin/lib/insights-generator";

export function HighlightsPanel({ insights }: { insights: SystemInsight[] }) {
  return (
          <div className="glass-card rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-[var(--marketing-accent-soft)] text-xs text-[var(--marketing-accent-text)] font-bold">
                  ✦
                </span>
                <h3 className="font-headline text-[14px] font-bold text-[var(--text-primary)]">
                  Highlights
                </h3>
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 font-data">
                Rule-based summary
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  className={`rounded-xl border p-3 transition-all ${
                    insight.tone === "good"
                      ? "border-emerald-500/25 bg-emerald-500/5 hover:border-emerald-500/40"
                      : insight.tone === "warn"
                        ? "border-amber-500/25 bg-amber-500/5 hover:border-amber-500/40"
                        : "border-[var(--border-subtle)] bg-[var(--surface-2)]/60 hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--marketing-accent-text)]">
                      {insight.category}
                    </span>
                    {insight.metric && (
                      <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-data text-[10.5px] font-bold text-[var(--text-primary)]">
                        {insight.metric}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[12.5px] font-bold text-[var(--text-primary)]">{insight.title}</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-500 dark-theme:text-zinc-400">{insight.description}</p>
                </div>
              ))}
            </div>
          </div>
  );
}
