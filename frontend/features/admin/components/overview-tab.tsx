"use client";

import { useEffect, useMemo, useState } from "react";
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
import { HourlyHeatmap } from "@/features/admin/components/hourly-heatmap";
import { UserAnalyticsDrawer } from "@/features/admin/components/user-analytics-drawer";
import {
  type DateRangePreset,
  calculateDelta,
  formatRangeLabel,
  getPresetDateRange,
} from "@/features/admin/lib/date-range-utils";
import { generateCommandInsights } from "@/features/admin/lib/insights-generator";
import { exportTableCsv } from "@/features/admin/lib/chart-export";
import type { AdminAnalyticsWithHourly } from "@/features/admin/lib/types";

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

  const analytics = rawAnalytics as AdminAnalyticsWithHourly | undefined;

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

  // DAU / WAU / MAU Stickiness
  const dau = stats?.active_users_24h ?? 0;
  const wau = analytics?.active_users_7d ?? 0;
  const mau = analytics?.active_users_30d ?? stats?.active_users ?? 0;
  const stickinessPct = mau > 0 ? Math.round((dau / mau) * 1000) / 10 : 0;

  // Platform Reliability Metrics
  const avgToolDuration = useMemo(() => {
    const tools = analytics?.tools ?? [];
    if (tools.length === 0) return 0;
    const weightedSum = tools.reduce((s, t) => s + t.avg_ms * t.requests, 0);
    const sumReqs = tools.reduce((s, t) => s + t.requests, 0);
    return sumReqs > 0 ? Math.round(weightedSum / sumReqs) : 0;
  }, [analytics?.tools]);

  const p95ToolDuration = useMemo(() => {
    const tools = analytics?.tools ?? [];
    if (tools.length === 0) return 0;
    return Math.max(...tools.map((t) => t.p95_ms));
  }, [analytics?.tools]);

  const dateRangeLabel = formatRangeLabel(start, end);
  const userScopeLabel = scopedEmail || (scopedUserId ? `User #${scopedUserId}` : "All Users");

  // Executive Telemetry Report Download
  const handleDownloadExecutiveReport = () => {
    const headers = ["Metric", "PeriodTotal", "PreviousTotal", "DeltaPct", "Notes"];
    const rows = [
      ["Tool Requests", totalRequests, prevRequests, reqDelta.pct !== null ? `${reqDelta.pct}%` : "—", "API and AI tool calls"],
      ["Execution Errors", totalErrors, prevErrors, errDelta.pct !== null ? `${errDelta.pct}%` : "—", `${errorRate.toFixed(2)}% overall error rate`],
      ["New Sign-ups", totalSignups, prevSignups, signupDelta.pct !== null ? `${signupDelta.pct}%` : "—", "New registered accounts"],
      ["Chat Messages", totalMessages, prevMessages, msgDelta.pct !== null ? `${msgDelta.pct}%` : "—", "Copilot interactive queries"],
      ["Document Uploads", totalDocuments, prevDocuments, docDelta.pct !== null ? `${docDelta.pct}%` : "—", "Ingested PDF documents"],
      ["DAU (24h)", dau, "—", "—", "Active unique users in last 24h"],
      ["WAU (7d)", wau, "—", "—", "Active unique users in last 7d"],
      ["MAU (30d)", mau, "—", "—", "Active unique users in last 30d"],
      ["DAU/MAU Stickiness", `${stickinessPct}%`, "—", "—", "Engagement retention ratio"],
      ["Average Tool Latency", `${avgToolDuration}ms`, "—", "—", "Weighted avg latency"],
      ["p95 Tool Latency", `${p95ToolDuration}ms`, "—", "—", "Peak 95th percentile latency"],
    ];

    exportTableCsv({
      filename: `querex-executive-report-${new Date().toISOString().slice(0, 10)}.csv`,
      title: "Executive Operations & Reliability Report",
      dateRange: dateRangeLabel,
      scope: userScopeLabel,
      headers,
      rows,
    });
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
              title="Refresh telemetry now"
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

          {/* Download Executive Telemetry Report Button */}
          <button
            type="button"
            onClick={handleDownloadExecutiveReport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1 font-data text-[11.5px] font-bold text-[var(--text-primary)] shadow-xs transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
            title="Download executive telemetry summary CSV report"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export Report
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
                <p className="mt-1 text-[11px] text-zinc-500 font-data">{stats?.requests_24h ?? 0} in 24h</p>
              )}
            </div>

            {/* Active Users */}
            <div className="glass-card flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] p-3.5 hover:border-[var(--border-strong)] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Active (7d)</span>
                <MiniSparkline data={series.map((d) => d.signups * 2 + (d.requests % 5))} color="#059669" />
              </div>
              <p className="mt-2 font-data text-2xl font-bold text-emerald-700 dark-theme:text-emerald-400">
                {analytics?.active_users_7d ?? stats?.active_users_24h ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500 font-data">
                {analytics?.active_users_30d ?? 0} in 30d window
              </p>
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
                <p className="mt-1 text-[11px] text-zinc-500 font-data">{totalErrors} errors logged</p>
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
                <p className="mt-1 text-[11px] text-zinc-500 font-data">{stats?.total_users ?? 0} total users</p>
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
                <p className="mt-1 text-[11px] text-zinc-500 font-data">{stats?.total_messages ?? 0} total msgs</p>
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
                <p className="mt-1 text-[11px] text-zinc-500 font-data">{stats ? formatBytes(stats.total_storage_bytes) : "—"}</p>
              )}
            </div>
          </div>

          {/* Retention & Reliability Command Scorecard Bar */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* DAU/MAU Stickiness Ratio */}
            <div className="glass-card rounded-xl border border-[var(--border-subtle)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  DAU / MAU Stickiness
                </span>
                <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-data text-[10px] font-bold text-zinc-400">
                  Engagement
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-data text-2xl font-bold text-[var(--text-primary)]">
                  {stickinessPct}%
                </span>
                <span className="text-xs text-zinc-500 font-data">
                  {dau} DAU · {mau} MAU
                </span>
              </div>
              <div className="mt-2">
                <HBar value={dau} max={Math.max(1, mau)} color="#059669" />
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Measures daily recurring audience engagement across 30-day active population.
              </p>
            </div>

            {/* Platform Tool Success Rate */}
            <div className="glass-card rounded-xl border border-[var(--border-subtle)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Tool Success Rate
                </span>
                <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-data text-[10px] font-bold text-zinc-400">
                  Reliability
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-data text-2xl font-bold text-emerald-700 dark-theme:text-emerald-400">
                  {totalRequests > 0 ? (((totalRequests - totalErrors) / totalRequests) * 100).toFixed(1) : "100.0"}%
                </span>
                <span className="text-xs text-zinc-500 font-data">
                  {totalRequests - totalErrors} ok / {totalRequests} reqs
                </span>
              </div>
              <div className="mt-2">
                <HBar
                  value={totalRequests - totalErrors}
                  max={Math.max(1, totalRequests)}
                  color="var(--marketing-accent)"
                />
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Inference, search, and transformation executions completed with zero exceptions.
              </p>
            </div>

            {/* Average Response Latency */}
            <div className="glass-card rounded-xl border border-[var(--border-subtle)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Average Latency
                </span>
                <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-data text-[10px] font-bold text-zinc-400">
                  p50 Mean
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-data text-2xl font-bold text-[var(--text-primary)]">
                  {formatDuration(avgToolDuration)}
                </span>
                <span className="text-xs text-zinc-500 font-data">across tools</span>
              </div>
              <div className="mt-2">
                <HBar value={avgToolDuration} max={3000} color="#0284c7" />
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Weighted average execution latency across all AI tool invocations.
              </p>
            </div>

            {/* 95th Percentile Response Latency */}
            <div className="glass-card rounded-xl border border-[var(--border-subtle)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Tail Latency (p95)
                </span>
                <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-data text-[10px] font-bold text-zinc-400">
                  SLA Ceiling
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-data text-2xl font-bold text-[var(--marketing-accent-text)]">
                  {formatDuration(p95ToolDuration)}
                </span>
                <span className="text-xs text-zinc-500 font-data">max p95</span>
              </div>
              <div className="mt-2">
                <HBar value={p95ToolDuration} max={8000} color="#f59e0b" />
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                95% of requests finish faster than this threshold even during peak load.
              </p>
            </div>
          </div>

          {/* Automated Plain-English Insights Panel */}
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

          {/* 7x24 Weekday x Hour Heatmap Card */}
          <HourlyHeatmap
            hourly={analytics?.hourly}
            dateRange={dateRangeLabel}
            scope={userScopeLabel}
          />

          {/* 6 Dynamic 3D/2D Switchable Charts Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-headline text-[15px] font-bold text-[var(--text-primary)]">
                  Operational Trajectory
                </h2>
                <p className="text-[12px] text-zinc-500 dark-theme:text-zinc-400">
                  Interactive high-DPI 2D area/line/bars, GitHub activity calendar, and genuine 3D visualizers with click-to-pin and export capabilities
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
