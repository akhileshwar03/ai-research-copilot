"use client";

import { Badge, HBar, SectionCard, formatDuration } from "@/features/admin/components/shared";
import type { AdminAnalytics } from "@/services/api/admin-api";

export function ToolAndUserBreakdown({
  analytics,
  maxToolRequests,
  maxUserRequests,
  onSelectUser,
}: {
  analytics: AdminAnalytics | undefined;
  maxToolRequests: number;
  maxUserRequests: number;
  onSelectUser: (userId: number, email: string) => void;
}) {
  return (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Tool Breakdown Table */}
            <SectionCard
              title="Product Utilization Scorecard"
              className="lg:col-span-2"
              description="Detailed breakdown of request throughput, latency benchmarks, and failure ratios per tool."
            >
              {(analytics?.tools.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-xs text-zinc-500">No requests in this window.</p>
              ) : (
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full text-left text-[12.5px]">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
                        <th className="pb-2.5 pl-1">Tool</th>
                        <th className="pb-2.5 text-right">Throughput</th>
                        <th className="pb-2.5 text-right">Errors</th>
                        <th className="pb-2.5 text-right">Avg</th>
                        <th className="pb-2.5 text-right">p95</th>
                        <th className="pb-2.5 pr-1 text-right">Users</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {analytics?.tools.map((t) => (
                        <tr key={t.tool} className="hover:bg-[var(--surface-2)]/60 transition-colors">
                          <td className="py-2.5 pl-1 pr-3">
                            <p className="font-semibold text-[var(--text-primary)]">{t.label}</p>
                            <div className="mt-1 w-28 sm:w-36">
                              <HBar value={t.requests} max={maxToolRequests} />
                            </div>
                          </td>
                          <td className="py-2.5 text-right font-data font-bold tabular-nums text-[var(--text-primary)]">
                            {t.requests.toLocaleString()}
                          </td>
                          <td className="py-2.5 text-right">
                            <Badge tone={t.error_rate > 0.05 ? "bad" : t.error_rate > 0.02 ? "warn" : "good"} dot>
                              {t.errors} ({(t.error_rate * 100).toFixed(1)}%)
                            </Badge>
                          </td>
                          <td className="py-2.5 text-right font-data tabular-nums text-zinc-600 dark-theme:text-zinc-300">
                            {formatDuration(t.avg_ms)}
                          </td>
                          <td className="py-2.5 text-right font-data tabular-nums text-zinc-500 dark-theme:text-zinc-400">
                            {formatDuration(t.p95_ms)}
                          </td>
                          <td className="py-2.5 pr-1 text-right font-data tabular-nums text-zinc-600 dark-theme:text-zinc-300">
                            {t.users}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {/* Top Active Users Leaderboard */}
            <div className="space-y-4">
              <SectionCard
                title="Top Active Users"
                description="Leaderboard of accounts with highest volume. Click any user to analyze their personal timeline or scope all charts."
              >
                {(analytics?.top_users.length ?? 0) === 0 ? (
                  <p className="py-4 text-center text-xs text-zinc-500">No active accounts in window.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {analytics?.top_users.map((u, i) => (
                      <li
                        key={u.user_id}
                        onClick={() => onSelectUser(u.user_id, u.email)}
                        className="cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/60 p-2.5 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                                i === 0
                                  ? "bg-amber-400/20 text-amber-700 dark-theme:text-amber-300 ring-1 ring-amber-400/40"
                                  : i === 1
                                    ? "bg-zinc-300/30 text-zinc-700 dark-theme:text-zinc-200 ring-1 ring-zinc-400/40"
                                    : i === 2
                                      ? "bg-orange-400/20 text-orange-700 dark-theme:text-orange-300 ring-1 ring-orange-400/40"
                                      : "bg-[var(--surface-3)] text-zinc-500"
                              }`}
                            >
                              {i + 1}
                            </span>
                            <span className="truncate font-semibold text-[var(--text-primary)]" title={u.email}>
                              {u.email}
                            </span>
                          </div>
                          <span className="shrink-0 font-data font-bold text-zinc-600 dark-theme:text-zinc-300">
                            {u.requests.toLocaleString()} reqs
                          </span>
                        </div>
                        <div className="mt-2">
                          <HBar value={u.requests} max={maxUserRequests} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </div>
  );
}
