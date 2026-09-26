"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminApi } from "@/services/api/admin-api";
import { DeltaBadge, HBar, formatBytes, formatDuration } from "@/features/admin/components/shared";
import { HighlightsPanel } from "@/features/admin/components/overview-highlights";
import { ToolAndUserBreakdown } from "@/features/admin/components/overview-breakdown";
import { DateRangePicker } from "@/features/admin/components/date-range-picker";
import { DynamicChart } from "@/features/admin/components/dynamic-chart";
import { UserAnalyticsDrawer } from "@/features/admin/components/user-analytics-drawer";
import { type DateRangePreset, calculateDelta, formatRangeLabel, getPresetDateRange } from "@/features/admin/lib/date-range-utils";
import { generateCommandInsights } from "@/features/admin/lib/insights-generator";
import { downloadBlob } from "@/features/admin/lib/chart-export";

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

  // Auto-refresh interval (ms) or false if paused
  const [refreshInterval, setRefreshInterval] = useState<number | false>(60_000);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.stats(),
    refetchInterval: refreshInterval,
  });

  const {
    data: rawAnalytics,
    isLoading,
    isFetching,
    error: analyticsError,
    dataUpdatedAt,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ["admin-analytics", { start, end, scopedUserId, compare }],
    queryFn: () =>
      adminApi.analytics({
        start,
        end,
        user_id: scopedUserId,
        compare,
      }),
    refetchInterval: refreshInterval,
    retry: false,
  });

  const analytics = rawAnalytics;

  // Track freshness timer derived from clock and query update time
  const secondsAgo = dataUpdatedAt ? Math.max(0, Math.floor((now - dataUpdatedAt) / 1000)) : 0;

  const handleManualRefresh = () => {
    refetchAnalytics();
    refetchStats();
  };

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

  // Active users (range-aware) and engagement (windows ending on the range's last day)
  const activeUsers = analytics?.active_users ?? 0;
  const activeDelta = calculateDelta(activeUsers, compare ? (analytics?.previous?.active_users ?? 0) : null);
  const activeSeries = useMemo(() => series.map((d) => d.active_users), [series]);
  const avgDailyActive = series.length > 0 ? activeSeries.reduce((a, b) => a + b, 0) / series.length : 0;
  const peakDailyActive = Math.max(0, ...activeSeries);
  const totalSessions = useMemo(() => series.reduce((s, d) => s + d.sessions, 0), [series]);
  const engagement = analytics?.engagement;

  // Latency comes from the backend (exact average, p95 over recent requests), not averaged client-side
  const avgLatency = analytics?.latency.avg_ms ?? 0;
  const p95Latency = analytics?.latency.p95_ms ?? 0;
  const slowestTool = useMemo(
    () => [...(analytics?.tools ?? [])].sort((a, b) => b.p95_ms - a.p95_ms)[0],
    [analytics?.tools],
  );

  const dateRangeLabel = formatRangeLabel(start, end);
  const userScopeLabel = scopedEmail || (scopedUserId ? `User #${scopedUserId}` : "All Users");

  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const handleDownloadReport = async () => {
    setIsGeneratingReport(true);
    try {
      const blob = await adminApi.downloadReport({ start, end, user_id: scopedUserId });
      const scopeSuffix = scopedUserId ? `-user-${scopedUserId}` : "";
      downloadBlob(blob, `querex-report-${start}_to_${end}${scopeSuffix}.pdf`);
      toast.success("PDF report downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate the report");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Date Range, User Scope & Freshness Bar */}
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
              <span className="text-[12px] font-bold text-sky-700 dark-theme:text-sky-200">
                Scoped to: {scopedEmail || `User #${scopedUserId}`}
              </span>
              <button
                type="button"
                onClick={handleClearScope}
                className="ml-1 text-sky-500 hover:text-sky-800 dark-theme:text-sky-400 dark-theme:hover:text-white"
                title="Clear user scope filter"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Honest Freshness Ticker & Auto-Refresh Control */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2.5 py-1 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                refreshInterval === false
                  ? "bg-amber-400"
                  : isFetching
                    ? "bg-[var(--marketing-accent)] animate-ping"
                    : "bg-emerald-500"
              }`}
            />
            <span className="font-data text-[11px] text-zinc-500 dark-theme:text-zinc-400">
              {isFetching ? "Refreshing…" : secondsAgo === 0 ? "Updated just now" : `Updated ${secondsAgo}s ago`}
            </span>
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isFetching}
              className="rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark-theme:hover:text-zinc-200"
              title="Refresh data"
            >
              <svg
                className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-[var(--marketing-accent)]" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
            </button>
          </div>

          {/* Auto-Refresh cadence picker */}
          <select
            value={refreshInterval === false ? "paused" : String(refreshInterval)}
            onChange={(e) =>
              setRefreshInterval(e.target.value === "paused" ? false : Number(e.target.value))
            }
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2 py-1 font-data text-[11px] text-zinc-600 dark-theme:text-zinc-300 hover:bg-[var(--surface-2)] cursor-pointer"
          >
            <option value="30000">Auto: 30s</option>
            <option value="60000">Auto: 60s</option>
            <option value="120000">Auto: 2m</option>
            <option value="paused">Paused</option>
          </select>

          {/* PDF report */}
          <button
            type="button"
            onClick={handleDownloadReport}
            disabled={isGeneratingReport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1 font-data text-[11.5px] font-bold text-[var(--text-primary)] shadow-xs transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:cursor-wait disabled:opacity-60"
            title="Download a detailed PDF report (charts, tables and commentary) for the selected range and scope"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {isGeneratingReport ? "Generating PDF…" : "Download PDF report"}
          </button>
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
          {/* Hero KPI Strip with Sparklines & Period Deltas */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {/* Total Requests */}
            <div className="glass-card flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] p-3.5 hover:border-[var(--border-strong)] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Requests</span>
                <MiniSparkline data={series.map((d) => d.requests)} color="var(--marketing-accent)" />
              </div>
              <p className="mt-2 font-data text-2xl font-bold text-[var(--text-primary)]">
                {totalRequests.toLocaleString()}
              </p>
              {compare && reqDelta.pct !== null ? (
                <DeltaBadge change={reqDelta.diff} amount={`${Math.abs(reqDelta.pct ?? 0)}%`} suffix="vs prior" />
              ) : (
                <p className="mt-1 text-[11px] text-zinc-500 font-data">
                  avg {series.length > 0 ? Math.round(totalRequests / series.length).toLocaleString() : 0}/day
                </p>
              )}
            </div>

            {/* Active Users (distinct users with a request in the selected range) */}
            <div className="glass-card flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] p-3.5 hover:border-[var(--border-strong)] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Active users</span>
                <MiniSparkline data={activeSeries} color="#059669" />
              </div>
              <p className="mt-2 font-data text-2xl font-bold text-emerald-700 dark-theme:text-emerald-400">
                {activeUsers.toLocaleString()}
              </p>
              {compare && activeDelta.pct !== null ? (
                <DeltaBadge change={activeDelta.diff} amount={`${Math.abs(activeDelta.pct ?? 0)}%`} suffix="vs prior" />
              ) : (
                <p className="mt-1 text-[11px] text-zinc-500 font-data">
                  avg {avgDailyActive.toFixed(1)}/day · peak {peakDailyActive}
                </p>
              )}
            </div>

            {/* Error Rate */}
            <div className="glass-card flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] p-3.5 hover:border-[var(--border-strong)] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Error Rate</span>
                <MiniSparkline data={series.map((d) => d.errors)} color="#e11d48" />
              </div>
              <p
                className={`mt-2 font-data text-2xl font-bold ${
                  errorRate > 5
                    ? "text-rose-700 dark-theme:text-rose-400"
                    : errorRate > 2
                      ? "text-amber-700 dark-theme:text-amber-400"
                      : "text-[var(--text-primary)]"
                }`}
              >
                {errorRate.toFixed(1)}%
              </p>
              {compare && errDelta.pct !== null ? (
                <DeltaBadge
                  change={errRatePts}
                  amount={`${Math.abs(errRatePts).toFixed(1)} pts`}
                  suffix="error rate vs prior"
                  higherIsBetter={false}
                />
              ) : (
                <p className="mt-1 text-[11px] text-zinc-500 font-data">
                  {totalErrors.toLocaleString()} of {totalRequests.toLocaleString()} requests
                </p>
              )}
            </div>

            {/* New Signups */}
            <div className="glass-card flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] p-3.5 hover:border-[var(--border-strong)] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Sign-ups</span>
                <MiniSparkline data={series.map((d) => d.signups)} color="#0284c7" />
              </div>
              <p className="mt-2 font-data text-2xl font-bold text-sky-700 dark-theme:text-sky-400">
                +{totalSignups.toLocaleString()}
              </p>
              {compare && signupDelta.pct !== null ? (
                <DeltaBadge change={signupDelta.diff} amount={`${Math.abs(signupDelta.pct ?? 0)}%`} suffix="growth" />
              ) : (
                <p className="mt-1 text-[11px] text-zinc-500 font-data">
                  {scopedUserId ? "this account" : `${(stats?.total_users ?? 0).toLocaleString()} accounts in total`}
                </p>
              )}
            </div>

            {/* Chat Messages */}
            <div className="glass-card flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] p-3.5 hover:border-[var(--border-strong)] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Chat Msgs</span>
                <MiniSparkline data={series.map((d) => d.messages)} color="#4f46e5" />
              </div>
              <p className="mt-2 font-data text-2xl font-bold text-indigo-700 dark-theme:text-indigo-400">
                {totalMessages.toLocaleString()}
              </p>
              {compare && msgDelta.pct !== null ? (
                <DeltaBadge change={msgDelta.diff} amount={`${Math.abs(msgDelta.pct ?? 0)}%`} suffix="volume" />
              ) : (
                <p className="mt-1 text-[11px] text-zinc-500 font-data">{totalSessions.toLocaleString()} sessions</p>
              )}
            </div>

            {/* Documents */}
            <div className="glass-card flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] p-3.5 hover:border-[var(--border-strong)] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Documents</span>
                <MiniSparkline data={series.map((d) => d.documents)} color="#7c3aed" />
              </div>
              <p className="mt-2 font-data text-2xl font-bold text-violet-700 dark-theme:text-violet-400">
                +{totalDocuments.toLocaleString()}
              </p>
              {compare && docDelta.pct !== null ? (
                <DeltaBadge change={docDelta.diff} amount={`${Math.abs(docDelta.pct ?? 0)}%`} suffix="uploads" />
              ) : (
                <p className="mt-1 text-[11px] text-zinc-500 font-data">
                  {scopedUserId ? "uploaded in range" : stats ? `${formatBytes(stats.total_storage_bytes)} stored` : "—"}
                </p>
              )}
            </div>
          </div>

          {/* Retention & Reliability Command Scorecard Bar */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Engagement: DAU/MAU stickiness (windows end on the range's last day) */}
            <div className="glass-card rounded-xl border border-[var(--border-subtle)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Stickiness</span>
                <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-data text-[10px] font-bold text-zinc-400">
                  DAU / MAU
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-data text-2xl font-bold text-[var(--text-primary)]">
                  {(engagement?.stickiness_pct ?? 0).toFixed(1)}%
                </span>
                <span className="text-xs text-zinc-500 font-data">
                  avg {engagement?.avg_dau ?? 0} DAU · {engagement?.mau ?? 0} MAU
                </span>
              </div>
              <div className="mt-2">
                <HBar value={engagement?.stickiness_pct ?? 0} max={100} color="#059669" />
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Average daily users divided by monthly users, over the 30 days ending {end}. {engagement?.wau ?? 0} users
                were active in the final 7 days.
              </p>
            </div>

            <div className="glass-card rounded-xl border border-[var(--border-subtle)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Average Latency
                </span>
                <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-data text-[10px] font-bold text-zinc-400">
                  Mean
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-data text-2xl font-bold text-[var(--text-primary)]">
                  {formatDuration(avgLatency)}
                </span>
                <span className="text-xs text-zinc-500 font-data">per request</span>
              </div>
              <div className="mt-2">
                <HBar value={avgLatency} max={Math.max(1, p95Latency)} color="#0284c7" />
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Mean time to finish a request, including streamed AI responses. The bar shows the mean against the p95.
              </p>
            </div>

            {/* p95 latency */}
            <div className="glass-card rounded-xl border border-[var(--border-subtle)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Slowest 5%
                </span>
                <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-data text-[10px] font-bold text-zinc-400">
                  p95
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-data text-2xl font-bold text-[var(--marketing-accent-text)]">
                  {formatDuration(p95Latency)}
                </span>
                <span className="text-xs text-zinc-500 font-data">or longer</span>
              </div>
              <p className="mt-3 text-[11px] text-zinc-500">
                {slowestTool
                  ? `95% of requests finished faster than this. Slowest tool: ${slowestTool.label} (p95 ${formatDuration(slowestTool.p95_ms)}).`
                  : "No requests in this range."}
              </p>
            </div>
          </div>

          <HighlightsPanel insights={insights} />

          {/* 6 Switchable Charts Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-headline text-[15px] font-bold text-[var(--text-primary)]">
                  Activity Trends
                </h2>
                <p className="text-[12px] text-zinc-500 dark-theme:text-zinc-400">
                  Switch any chart between area, bars, donut and activity calendar; click to pin values and export as PNG or CSV
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
                  <p className="text-[13px] font-medium text-zinc-400">Loading analytics…</p>
                </div>
              </div>
            ) : (
              <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
                <DynamicChart
                  id="chart-requests"
                  metricKey="requests"
                  title="Tool Requests / Day"
                  data={series.map((d, i) => ({
                    label: d.date,
                    value: d.requests,
                    compareValue: prevSeries[i]?.requests,
                  }))}
                  unit="reqs"
                  dateRange={dateRangeLabel}
                  scope={userScopeLabel}
                />
                <DynamicChart
                  id="chart-errors"
                  metricKey="errors"
                  title="Errors / Day"
                  data={series.map((d, i) => ({
                    label: d.date,
                    value: d.errors,
                    compareValue: prevSeries[i]?.errors,
                  }))}
                  color="#e11d48"
                  unit="errs"
                  dateRange={dateRangeLabel}
                  scope={userScopeLabel}
                />
                <DynamicChart
                  id="chart-signups"
                  metricKey="signups"
                  title="New Sign-ups / Day"
                  data={series.map((d, i) => ({
                    label: d.date,
                    value: d.signups,
                    compareValue: prevSeries[i]?.signups,
                  }))}
                  color="#059669"
                  unit="signups"
                  dateRange={dateRangeLabel}
                  scope={userScopeLabel}
                />
                <DynamicChart
                  id="chart-messages"
                  metricKey="messages"
                  title="Chat Messages / Day"
                  data={series.map((d, i) => ({
                    label: d.date,
                    value: d.messages,
                    compareValue: prevSeries[i]?.messages,
                  }))}
                  color="#0284c7"
                  unit="msgs"
                  dateRange={dateRangeLabel}
                  scope={userScopeLabel}
                />
                <DynamicChart
                  id="chart-documents"
                  metricKey="documents"
                  title="Documents Uploaded / Day"
                  data={series.map((d, i) => ({
                    label: d.date,
                    value: d.documents,
                    compareValue: prevSeries[i]?.documents,
                  }))}
                  color="#7c3aed"
                  unit="docs"
                  dateRange={dateRangeLabel}
                  scope={userScopeLabel}
                />
                <DynamicChart
                  id="chart-humanizer"
                  metricKey="humanizer_runs"
                  title="Humanizer Runs / Day"
                  data={series.map((d, i) => ({
                    label: d.date,
                    value: d.humanizer_runs,
                    compareValue: prevSeries[i]?.humanizer_runs,
                  }))}
                  color="#d97706"
                  unit="runs"
                  dateRange={dateRangeLabel}
                  scope={userScopeLabel}
                />
              </div>
            )}
          </div>

          <ToolAndUserBreakdown
            analytics={analytics}
            maxToolRequests={maxToolRequests}
            maxUserRequests={maxUserRequests}
            onSelectUser={(id, email) => {
              setSelectedUserId(id);
              setSelectedUserEmail(email);
            }}
          />
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
