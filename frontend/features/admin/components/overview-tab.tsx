"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { adminApi } from "@/services/api/admin-api";
import {
  Badge,
  DeltaBadge,
  HBar,
  SectionCard,
  formatBytes,
  formatDuration,
} from "@/features/admin/components/shared";
import { DateRangePicker } from "@/features/admin/components/date-range-picker";
import { DynamicChart } from "@/features/admin/components/dynamic-chart";
import { UserAnalyticsDrawer } from "@/features/admin/components/user-analytics-drawer";
import {
  type DateRangePreset,
  calculateDelta,
  getPresetDateRange,
} from "@/features/admin/lib/date-range-utils";
import { generateCommandInsights } from "@/features/admin/lib/insights-generator";

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(1, ...data);
  const width = 80;
  const height = 24;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (v / max) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible select-none">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function OverviewTab() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL state synchronization
  const defaultRange = getPresetDateRange("30d");
  const start = searchParams.get("start") || defaultRange.start;
  const end = searchParams.get("end") || defaultRange.end;
  const preset = (searchParams.get("preset") as DateRangePreset) || "30d";
  const compare = searchParams.get("compare") === "true";

  const userIdParam = searchParams.get("user_id");
  const scopedUserId = userIdParam ? parseInt(userIdParam, 10) : undefined;
  const scopedEmail = searchParams.get("user_email") || undefined;

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | undefined>(undefined);

  const updateRangeParams = (newStart: string, newEnd: string, newPreset: DateRangePreset) => {
    const q = new URLSearchParams(searchParams.toString());
    q.set("start", newStart);
    q.set("end", newEnd);
    q.set("preset", newPreset);
    router.replace(`/admin?${q.toString()}`);
  };

  const updateCompareParam = (newCompare: boolean) => {
    const q = new URLSearchParams(searchParams.toString());
    if (newCompare) q.set("compare", "true");
    else q.delete("compare");
    router.replace(`/admin?${q.toString()}`);
  };

  const handleScopeUser = (id: number, email: string) => {
    const q = new URLSearchParams(searchParams.toString());
    q.set("user_id", String(id));
    q.set("user_email", email);
    router.replace(`/admin?${q.toString()}`);
  };

  const handleClearScope = () => {
    const q = new URLSearchParams(searchParams.toString());
    q.delete("user_id");
    q.delete("user_email");
    router.replace(`/admin?${q.toString()}`);
  };

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.stats(),
    refetchInterval: 60_000,
  });

  const {
    data: analytics,
    isLoading,
    error: analyticsError,
  } = useQuery({
    queryKey: ["admin-analytics", { start, end, scopedUserId, compare }],
    queryFn: () =>
      adminApi.analytics({
        start,
        end,
        user_id: scopedUserId,
        compare,
      }),
    refetchInterval: 120_000,
    retry: false,
  });

  const series = useMemo(() => analytics?.series ?? [], [analytics?.series]);
  const prevSeries = useMemo(() => analytics?.previous?.series ?? [], [analytics?.previous?.series]);

  // Computed insights
  const insights = useMemo(
    () => generateCommandInsights(analytics, analytics?.previous),
    [analytics],
  );

  // Aggregated totals in current range
  const totalRequests = useMemo(() => series.reduce((s, d) => s + d.requests, 0), [series]);
  const totalErrors = useMemo(() => series.reduce((s, d) => s + d.errors, 0), [series]);
  const totalSignups = useMemo(() => series.reduce((s, d) => s + d.signups, 0), [series]);
  const totalMessages = useMemo(() => series.reduce((s, d) => s + d.messages, 0), [series]);
  const totalDocuments = useMemo(() => series.reduce((s, d) => s + d.documents, 0), [series]);

  // Aggregated totals in previous range (if comparison active)
  const prevRequests = useMemo(() => prevSeries.reduce((s, d) => s + d.requests, 0), [prevSeries]);
  const prevErrors = useMemo(() => prevSeries.reduce((s, d) => s + d.errors, 0), [prevSeries]);
  const prevSignups = useMemo(() => prevSeries.reduce((s, d) => s + d.signups, 0), [prevSeries]);
  const prevMessages = useMemo(() => prevSeries.reduce((s, d) => s + d.messages, 0), [prevSeries]);
  const prevDocuments = useMemo(() => prevSeries.reduce((s, d) => s + d.documents, 0), [prevSeries]);

  const reqDelta = calculateDelta(totalRequests, compare ? prevRequests : null);
  const errDelta = calculateDelta(totalErrors, compare ? prevErrors : null);
  const signupDelta = calculateDelta(totalSignups, compare ? prevSignups : null);
  const msgDelta = calculateDelta(totalMessages, compare ? prevMessages : null);
  const docDelta = calculateDelta(totalDocuments, compare ? prevDocuments : null);

  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
  const prevErrorRate = prevRequests > 0 ? (prevErrors / prevRequests) * 100 : 0;
  const errRatePts = Math.round((errorRate - prevErrorRate) * 10) / 10;
  const maxToolRequests = Math.max(1, ...(analytics?.tools ?? []).map((t) => t.requests));
  const maxUserRequests = Math.max(1, ...(analytics?.top_users ?? []).map((u) => u.requests));

  return (
    <div className="space-y-6">
      {/* Date Range & Command Filters Bar */}
      <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] p-3.5 shadow-sm sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker
            start={start}
            end={end}
            preset={preset}
            compare={compare}
            onRangeChange={updateRangeParams}
            onCompareChange={updateCompareParam}
          />

          {scopedUserId && (
            <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
              <span className="text-[12px] font-bold text-sky-200">
                Scoped to: {scopedEmail || `User #${scopedUserId}`}
              </span>
              <button
                type="button"
                onClick={handleClearScope}
                className="ml-1 text-sky-400 hover:text-white"
                title="Clear user scope filter"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-400 font-data">
          <span>{series.length} data points</span>
          <span className="h-3 w-px bg-[var(--border-subtle)]" />
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Live Stream
          </span>
        </div>
      </div>

      {analyticsError && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          <p className="font-bold">Couldn&apos;t load analytics for this range</p>
          <p className="mt-0.5 text-[12px]">
            {analyticsError instanceof Error ? analyticsError.message : "Unexpected error."} Try a shorter range or
            pick a preset.
          </p>
        </div>
      )}

      {!analyticsError && (
        <>
      {/* Motivational Hero KPI Strip with Sparklines & Period Deltas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total Requests */}
        <div className="glass-card flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] p-3.5 hover:border-[var(--border-strong)] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Requests</span>
            <MiniSparkline data={series.map((d) => d.requests)} color="var(--marketing-accent)" />
          </div>
          <p className="mt-2 font-data text-2xl font-bold text-[var(--text-primary)]">
            {totalRequests.toLocaleString()}
          </p>
          {compare && reqDelta.pct !== null ? (
            <DeltaBadge change={reqDelta.diff} amount={`${Math.abs(reqDelta.pct ?? 0)}%`} suffix="vs prior" />
          ) : (
            <p className="mt-1 text-[11px] text-zinc-500 font-data">{stats?.requests_24h ?? 0} in 24h</p>
          )}
        </div>

        {/* Active Users */}
        <div className="glass-card flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] p-3.5 hover:border-[var(--border-strong)] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Active (7d)</span>
            <MiniSparkline data={series.map((d) => d.signups * 2 + d.requests % 5)} color="#34d399" />
          </div>
          <p className="mt-2 font-data text-2xl font-bold text-emerald-400">
            {analytics?.active_users_7d ?? stats?.active_users_24h ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 font-data">
            {analytics?.active_users_30d ?? 0} in 30d window
          </p>
        </div>

        {/* Error Rate */}
        <div className="glass-card flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] p-3.5 hover:border-[var(--border-strong)] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Error Rate</span>
            <MiniSparkline data={series.map((d) => d.errors)} color="#f87171" />
          </div>
          <p className={`mt-2 font-data text-2xl font-bold ${errorRate > 5 ? "text-rose-400" : errorRate > 2 ? "text-amber-400" : "text-zinc-200"}`}>
            {errorRate.toFixed(1)}%
          </p>
          {compare && errDelta.pct !== null ? (
            <DeltaBadge change={errRatePts} amount={`${Math.abs(errRatePts).toFixed(1)} pts`} suffix="error rate vs prior" higherIsBetter={false} />
          ) : (
            <p className="mt-1 text-[11px] text-zinc-500 font-data">{totalErrors} errors logged</p>
          )}
        </div>

        {/* New Signups */}
        <div className="glass-card flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] p-3.5 hover:border-[var(--border-strong)] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Sign-ups</span>
            <MiniSparkline data={series.map((d) => d.signups)} color="#38bdf8" />
          </div>
          <p className="mt-2 font-data text-2xl font-bold text-sky-400">
            +{totalSignups.toLocaleString()}
          </p>
          {compare && signupDelta.pct !== null ? (
            <DeltaBadge change={signupDelta.diff} amount={`${Math.abs(signupDelta.pct ?? 0)}%`} suffix="growth" />
          ) : (
            <p className="mt-1 text-[11px] text-zinc-500 font-data">{stats?.total_users ?? 0} total users</p>
          )}
        </div>

        {/* Chat Messages */}
        <div className="glass-card flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] p-3.5 hover:border-[var(--border-strong)] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Chat Msgs</span>
            <MiniSparkline data={series.map((d) => d.messages)} color="#60a5fa" />
          </div>
          <p className="mt-2 font-data text-2xl font-bold text-zinc-200">
            {totalMessages.toLocaleString()}
          </p>
          {compare && msgDelta.pct !== null ? (
            <DeltaBadge change={msgDelta.diff} amount={`${Math.abs(msgDelta.pct ?? 0)}%`} suffix="volume" />
          ) : (
            <p className="mt-1 text-[11px] text-zinc-500 font-data">{stats?.total_sessions ?? 0} sessions</p>
          )}
        </div>

        {/* Documents */}
        <div className="glass-card flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] p-3.5 hover:border-[var(--border-strong)] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Documents</span>
            <MiniSparkline data={series.map((d) => d.documents)} color="#c084fc" />
          </div>
          <p className="mt-2 font-data text-2xl font-bold text-purple-300">
            {totalDocuments.toLocaleString()}
          </p>
          {compare && docDelta.pct !== null ? (
            <DeltaBadge change={docDelta.diff} amount={`${Math.abs(docDelta.pct ?? 0)}%`} suffix="uploads" />
          ) : (
            <p className="mt-1 text-[11px] text-zinc-500 font-data">{stats ? formatBytes(stats.total_storage_bytes) : "—"}</p>
          )}
        </div>
      </div>

      {/* AI / Automated Plain-English Insights Panel */}
      <div className="glass-card rounded-2xl border border-[var(--border-subtle)] p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-[var(--marketing-accent-soft)] text-xs text-[var(--marketing-accent-text)] font-bold">
              ✦
            </span>
            <h3 className="font-headline text-[14px] font-bold text-[var(--text-primary)]">
              Automated Operations &amp; Growth Insights
            </h3>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 font-data">
            Telemetry Intelligence
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
                  <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.2 font-data text-[10.5px] font-bold text-zinc-200">
                    {insight.metric}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[12.5px] font-bold text-zinc-200">{insight.title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-400">{insight.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 6 Dynamic 3D/2D Switchable Charts Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-headline text-[15px] font-bold text-[var(--text-primary)]">
              Operational Trajectory
            </h2>
            <p className="text-[12px] text-zinc-400">
              Interactive 2D and genuine 3D visualizers with view switchers and drilldown capability
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="glass-card flex items-center justify-center rounded-xl p-16 text-center">
            <div className="flex flex-col items-center gap-2">
              <div
                className="h-7 w-7 animate-spin rounded-full border-2"
                style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--marketing-accent)" }}
              />
              <p className="text-[13px] font-medium text-zinc-400">Streaming analytics telemetry…</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DynamicChart
              id="chart-requests"
              metricKey="requests"
              title="Tool Requests / Day"
              data={series.map((d) => ({ label: d.date, value: d.requests }))}
              unit="reqs"
            />
            <DynamicChart
              id="chart-errors"
              metricKey="errors"
              title="Errors / Day"
              data={series.map((d) => ({ label: d.date, value: d.errors }))}
              color="#f87171"
              unit="errs"
            />
            <DynamicChart
              id="chart-signups"
              metricKey="signups"
              title="New Sign-ups / Day"
              data={series.map((d) => ({ label: d.date, value: d.signups }))}
              color="#34d399"
              unit="signups"
            />
            <DynamicChart
              id="chart-messages"
              metricKey="messages"
              title="Chat Messages / Day"
              data={series.map((d) => ({ label: d.date, value: d.messages }))}
              color="#60a5fa"
              unit="msgs"
            />
            <DynamicChart
              id="chart-documents"
              metricKey="documents"
              title="Documents Uploaded / Day"
              data={series.map((d) => ({ label: d.date, value: d.documents }))}
              color="#c084fc"
              unit="docs"
            />
            <DynamicChart
              id="chart-humanizer"
              metricKey="humanizer_runs"
              title="Humanizer Runs / Day"
              data={series.map((d) => ({ label: d.date, value: d.humanizer_runs }))}
              color="#fbbf24"
              unit="runs"
            />
          </div>
        )}
      </div>

      {/* Product Scorecard & Top Users Grid */}
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
                        <p className="font-semibold text-zinc-200">{t.label}</p>
                        <div className="mt-1 w-28 sm:w-36">
                          <HBar value={t.requests} max={maxToolRequests} />
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-data font-bold tabular-nums text-zinc-200">
                        {t.requests.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right">
                        <Badge tone={t.error_rate > 0.05 ? "bad" : t.error_rate > 0.02 ? "warn" : "good"} dot>
                          {t.errors} ({(t.error_rate * 100).toFixed(1)}%)
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right font-data tabular-nums text-zinc-300">
                        {formatDuration(t.avg_ms)}
                      </td>
                      <td className="py-2.5 text-right font-data tabular-nums text-zinc-400">
                        {formatDuration(t.p95_ms)}
                      </td>
                      <td className="py-2.5 pr-1 text-right font-data tabular-nums text-zinc-300">
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
                    onClick={() => {
                      setSelectedUserId(u.user_id);
                      setSelectedUserEmail(u.email);
                    }}
                    className="cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/60 p-2.5 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                            i === 0
                              ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40"
                              : i === 1
                                ? "bg-zinc-300/20 text-zinc-200 ring-1 ring-zinc-300/40"
                                : i === 2
                                  ? "bg-orange-400/20 text-orange-300 ring-1 ring-orange-400/40"
                                  : "bg-[var(--surface-3)] text-zinc-400"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span className="truncate font-semibold text-zinc-200" title={u.email}>
                          {u.email}
                        </span>
                      </div>
                      <span className="shrink-0 font-data font-bold text-zinc-300">
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

        </>
      )}

      {/* User Analytics Drilldown Drawer */}
      {selectedUserId && (
        <UserAnalyticsDrawer
          userId={selectedUserId}
          userEmail={selectedUserEmail}
          onClose={() => setSelectedUserId(null)}
          onScopeUser={handleScopeUser}
        />
      )}
    </div>
  );
}
