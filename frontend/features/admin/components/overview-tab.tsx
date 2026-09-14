"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { adminApi } from "@/services/api/admin-api";
import { BarChart, Badge, HBar, SectionCard, StatCard, formatBytes, formatDuration } from "@/features/admin/components/shared";

const RANGES = [7, 30, 90] as const;

export function OverviewTab() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.stats(),
    refetchInterval: 60_000,
  });
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["admin-analytics", days],
    queryFn: () => adminApi.analytics(days),
    refetchInterval: 120_000,
  });

  const series = analytics?.series ?? [];
  const maxToolRequests = Math.max(1, ...(analytics?.tools ?? []).map((t) => t.requests));
  const maxUserRequests = Math.max(1, ...(analytics?.top_users ?? []).map((u) => u.requests));
  const errorRate24h = stats && stats.requests_24h > 0 ? stats.errors_24h / stats.requests_24h : 0;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Users" value={stats?.total_users ?? "—"} hint={stats ? `${stats.new_users_7d} new this week` : undefined} />
        <StatCard label="Active (24h)" value={stats?.active_users_24h ?? "—"} hint={analytics ? `${analytics.active_users_7d} in 7d · ${analytics.active_users_30d} in 30d` : undefined} />
        <StatCard label="Requests (24h)" value={stats?.requests_24h ?? "—"} hint={stats ? `${stats.errors_24h} errors` : undefined} />
        <StatCard
          label="Error rate (24h)"
          value={stats ? `${(errorRate24h * 100).toFixed(1)}%` : "—"}
          tone={errorRate24h > 0.1 ? "bad" : errorRate24h > 0.03 ? "warn" : "good"}
        />
        <StatCard label="Suspended" value={stats?.suspended_users ?? "—"} tone={stats && stats.suspended_users > 0 ? "warn" : "neutral"} />
        <StatCard label="Documents" value={stats?.total_documents ?? "—"} hint={stats ? `${stats.failed_documents} failed/empty` : undefined} />
        <StatCard label="Storage" value={stats ? formatBytes(stats.total_storage_bytes) : "—"} />
        <StatCard label="Chat sessions" value={stats?.total_sessions ?? "—"} hint={stats ? `${stats.total_messages} messages` : undefined} />
        <StatCard label="Humanizer runs" value={stats?.total_humanizer_runs ?? "—"} />
        <StatCard label="Real-time chats" value={stats?.total_realtime_sessions ?? "—"} />
      </section>

      <div className="flex items-center justify-between">
        <h2 className="font-headline text-[15px] font-bold text-zinc-200">Activity</h2>
        <div className="flex gap-1 rounded-lg border border-[var(--border-subtle)] p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`rounded-md px-2.5 py-1 text-[12px] transition ${days === r ? "bg-[var(--surface-2)] text-[var(--text-primary)]" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-[13px] text-zinc-500">Loading analytics…</p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Tool requests per day">
              <BarChart data={series.map((d) => ({ label: d.date, value: d.requests }))} />
            </SectionCard>
            <SectionCard title="Errors per day">
              <BarChart data={series.map((d) => ({ label: d.date, value: d.errors }))} color="#f87171" />
            </SectionCard>
            <SectionCard title="New users per day">
              <BarChart data={series.map((d) => ({ label: d.date, value: d.signups }))} color="#34d399" />
            </SectionCard>
            <SectionCard title="Chat messages per day">
              <BarChart data={series.map((d) => ({ label: d.date, value: d.messages }))} color="#60a5fa" />
            </SectionCard>
            <SectionCard title="Documents uploaded per day">
              <BarChart data={series.map((d) => ({ label: d.date, value: d.documents }))} color="#a78bfa" />
            </SectionCard>
            <SectionCard title="Humanizer runs per day">
              <BarChart data={series.map((d) => ({ label: d.date, value: d.humanizer_runs }))} color="#fbbf24" />
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard title={`Usage by tool (${days}d)`} className="lg:col-span-2">
              {(analytics?.tools.length ?? 0) === 0 ? (
                <p className="text-[13px] text-zinc-500">No tool requests recorded in this window yet.</p>
              ) : (
                <table className="w-full text-[12.5px]">
                  <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="pb-2 text-left">Tool</th>
                      <th className="pb-2 text-right">Requests</th>
                      <th className="pb-2 text-right">Errors</th>
                      <th className="pb-2 text-right">Avg</th>
                      <th className="pb-2 text-right">p95</th>
                      <th className="pb-2 text-right">Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics?.tools.map((t) => (
                      <tr key={t.tool} className="border-t border-[var(--border-subtle)]">
                        <td className="py-2 pr-3">
                          <p className="text-zinc-200">{t.label}</p>
                          <HBar value={t.requests} max={maxToolRequests} />
                        </td>
                        <td className="py-2 text-right tabular-nums text-zinc-300">{t.requests.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums">
                          <Badge tone={t.error_rate > 0.1 ? "bad" : t.error_rate > 0.03 ? "warn" : "good"}>
                            {t.errors} · {(t.error_rate * 100).toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="py-2 text-right tabular-nums text-zinc-400">{formatDuration(t.avg_ms)}</td>
                        <td className="py-2 text-right tabular-nums text-zinc-400">{formatDuration(t.p95_ms)}</td>
                        <td className="py-2 text-right tabular-nums text-zinc-400">{t.users}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SectionCard>

            <div className="space-y-4">
              <SectionCard title={`Most active users (${days}d)`}>
                {(analytics?.top_users.length ?? 0) === 0 ? (
                  <p className="text-[13px] text-zinc-500">No activity yet.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {analytics?.top_users.map((u) => (
                      <li key={u.user_id}>
                        <div className="flex items-center justify-between gap-2 text-[12.5px]">
                          <span className="truncate text-zinc-300">{u.email}</span>
                          <span className="shrink-0 tabular-nums text-zinc-500">{u.requests}</span>
                        </div>
                        <HBar value={u.requests} max={maxUserRequests} />
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
              <SectionCard title="Documents by status">
                <ul className="space-y-1.5 text-[12.5px]">
                  {Object.entries(analytics?.documents_by_status ?? {}).length === 0 && (
                    <li className="text-zinc-500">No documents yet.</li>
                  )}
                  {Object.entries(analytics?.documents_by_status ?? {}).map(([status, n]) => (
                    <li key={status} className="flex items-center justify-between">
                      <Badge tone={status === "ready" ? "good" : status === "processing" ? "warn" : "bad"}>{status}</Badge>
                      <span className="tabular-nums text-zinc-400">{n}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
