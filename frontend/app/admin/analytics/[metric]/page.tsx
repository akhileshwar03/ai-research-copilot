"use client";

import { Suspense, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { forwardedQuery } from "@/features/admin/lib/admin-query";
import { useQuery } from "@tanstack/react-query";

import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import { adminApi, type AnalyticsDay } from "@/services/api/admin-api";
import { AtmosphereBackground } from "@/features/shared/components/atmosphere-background";
import { DeltaBadge, TableShell, Th, formatDay } from "@/features/admin/components/shared";
import { DynamicChart } from "@/features/admin/components/dynamic-chart";
import { calculateDelta, formatRangeLabel, getPresetDateRange } from "@/features/admin/lib/date-range-utils";

const METRIC_CONFIG: Record<
  string,
  {
    title: string;
    description: string;
    color: string;
    field: keyof AnalyticsDay;
    unit: string;
  }
> = {
  requests: {
    title: "Platform Tool Requests",
    description: "Total automated AI tool calls and API request throughput across all services.",
    color: "var(--marketing-accent)",
    field: "requests",
    unit: "reqs",
  },
  errors: {
    title: "System Execution Errors",
    description: "Inference failures, tool execution exceptions, and rate limit errors.",
    color: "#f87171",
    field: "errors",
    unit: "errors",
  },
  signups: {
    title: "New User Registrations",
    description: "Account creation events via Google, GitHub, and verified email codes.",
    color: "#34d399",
    field: "signups",
    unit: "signups",
  },
  messages: {
    title: "Chat Conversations & Messages",
    description: "Total messages streamed through Research Copilot and interactive chat sessions.",
    color: "#60a5fa",
    field: "messages",
    unit: "msgs",
  },
  documents: {
    title: "Document Upload Ingestion",
    description: "PDF files uploaded, parsed, and embedded into pgvector storage.",
    color: "#c084fc",
    field: "documents",
    unit: "docs",
  },
  humanizer_runs: {
    title: "Humanizer Rewrites & Runs",
    description: "AI-humanization transformations and detection bypass analyses completed.",
    color: "#fbbf24",
    field: "humanizer_runs",
    unit: "runs",
  },
  realtime_sessions: {
    title: "Real-time AI Grounded Searches",
    description: "Web-search grounded interactive sessions executed via Tavily.",
    color: "#38bdf8",
    field: "realtime_sessions",
    unit: "sessions",
  },
};

function AnalyticsDetailInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { isReady, isAuthenticated } = useAuthGuard();

  const metricKey = String(params.metric || "requests");
  const config = METRIC_CONFIG[metricKey] ?? METRIC_CONFIG.requests;

  const defaultRange = getPresetDateRange("30d");
  const start = searchParams.get("start") || defaultRange.start;
  const end = searchParams.get("end") || defaultRange.end;
  const compare = searchParams.get("compare") === "true";
  const userIdParam = searchParams.get("user_id");
  const userId = userIdParam ? parseInt(userIdParam, 10) : undefined;
  const scopedEmail = searchParams.get("user_email");

  const [filterQuery, setFilterQuery] = useState("");

  const { data: me, isLoading: isMeLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => adminApi.me(),
    enabled: isReady && isAuthenticated,
  });

  const { data: analytics, error: analyticsError } = useQuery({
    queryKey: ["admin-analytics-detail", { start, end, userId, compare }],
    queryFn: () => adminApi.analytics({ start, end, user_id: userId, compare }),
    refetchInterval: 60_000,
    retry: false,
  });

  const isForbidden = Boolean(me && !me.is_admin);

  const series = useMemo(() => analytics?.series ?? [], [analytics?.series]);
  const chartData = useMemo(() => {
    return series.map((d) => ({
      label: d.date,
      value: Number(d[config.field] ?? 0),
    }));
  }, [series, config.field]);

  const total = useMemo(() => chartData.reduce((s, d) => s + d.value, 0), [chartData]);
  const maxPoint = useMemo(() => {
    if (chartData.length === 0) return { label: "—", value: 0 };
    return [...chartData].sort((a, b) => b.value - a.value)[0];
  }, [chartData]);
  const avg = useMemo(() => (chartData.length > 0 ? Math.round(total / chartData.length) : 0), [chartData, total]);

  // Previous window comparison
  const prevSeries = analytics?.previous?.series;
  const prevTotal = prevSeries
    ? prevSeries.reduce((s, d) => s + Number(d[config.field] ?? 0), 0)
    : null;

  const delta = calculateDelta(total, prevTotal);

  const handleBack = () => {
    const q = new URLSearchParams(forwardedQuery(searchParams));
    q.set("tab", "overview");
    router.push(`/admin?${q.toString()}`);
  };

  const filteredDays = useMemo(() => {
    if (!filterQuery) return chartData;
    return chartData.filter((d) => d.label.includes(filterQuery));
  }, [chartData, filterQuery]);

  if (!isReady || !isAuthenticated || isMeLoading) {
    return (
      <div className="relative flex h-screen items-center justify-center">
        <AtmosphereBackground variant="calm" />
        <div
          className="relative z-10 h-7 w-7 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--marketing-accent)" }}
        />
      </div>
    );
  }

  if (isForbidden) return null;

  return (
    <div className="admin-console relative min-h-screen px-3 py-4 sm:px-6 sm:py-7">
      <AtmosphereBackground variant="calm" />
      <div className="relative z-10 mx-auto max-w-7xl space-y-6">
        {/* Navigation Bar */}
        <header className="glass-card flex flex-wrap items-center justify-between gap-3.5 rounded-2xl border border-[var(--border-subtle)] px-4 py-3.5 shadow-sm sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1.5 text-[12.5px] font-semibold text-zinc-300 transition hover:border-[var(--border-medium)] hover:bg-[var(--surface-2)] hover:text-white"
            >
              ← Command Center
            </button>
            <div className="h-5 w-px bg-[var(--border-subtle)]" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-headline text-lg font-bold tracking-tight text-[var(--text-primary)] sm:text-xl">
                  {config.title}
                </h1>
                <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10.5px] font-bold text-sky-400">
                  Telemetry Detail
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-zinc-400">{config.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {userId && (
              <span className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1 text-[12px] font-bold text-sky-800">
                Scoped to: {scopedEmail || `User #${userId}`}
              </span>
            )}
            <span className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1 text-[12px] font-bold font-data text-zinc-300">
              {formatRangeLabel(start, end)}
            </span>
          </div>
        </header>

        {analyticsError && (
          <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-800">
            <p className="font-bold">Couldn&apos;t load analytics for this range</p>
            <p className="mt-0.5 text-[12px]">
              {analyticsError instanceof Error ? analyticsError.message : "Unexpected error."} Go back and pick a
              shorter range.
            </p>
          </div>
        )}

        {/* Hero Telemetry Stat Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="glass-card rounded-xl border border-[var(--border-subtle)] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total in Period</p>
            <p className="mt-1 font-data text-2xl sm:text-3xl font-bold tabular-nums text-[var(--text-primary)]">
              {total.toLocaleString()} {config.unit}
            </p>
            {prevTotal !== null && (
              <DeltaBadge change={delta.diff} amount={`${Math.abs(delta.pct ?? 0)}%`} suffix="vs prior window" higherIsBetter={config.field !== "errors"} />
            )}
          </div>

          <div className="glass-card rounded-xl border border-[var(--border-subtle)] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Peak Surge Record</p>
            <p className="mt-1 font-data text-2xl sm:text-3xl font-bold tabular-nums text-[var(--marketing-accent-text)]">
              {maxPoint.value.toLocaleString()}
            </p>
            <p className="mt-1 text-[11.5px] text-zinc-400">
              Recorded on <span className="font-semibold text-zinc-200">{formatDay(maxPoint.label)}</span>
            </p>
          </div>

          <div className="glass-card rounded-xl border border-[var(--border-subtle)] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Daily Average</p>
            <p className="mt-1 font-data text-2xl sm:text-3xl font-bold tabular-nums text-zinc-200">
              {avg.toLocaleString()}
            </p>
            <p className="mt-1 text-[11.5px] text-zinc-400">Across {chartData.length} recorded dates</p>
          </div>

          <div className="glass-card rounded-xl border border-[var(--border-subtle)] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Variance Index</p>
            <p className="mt-1 font-data text-2xl sm:text-3xl font-bold tabular-nums text-sky-400">
              {maxPoint.value > 0 ? (maxPoint.value / Math.max(1, avg)).toFixed(1) : 1}x
            </p>
            <p className="mt-1 text-[11.5px] text-zinc-400">Peak vs average baseline ratio</p>
          </div>
        </div>

        {/* Master Dynamic Chart */}
        <div className="space-y-2">
          <DynamicChart
            id={`detail-${metricKey}`}
            title={`Full Telemetry Trajectory: ${config.title}`}
            data={chartData}
            color={config.color}
            unit={config.unit}
            height={260}
          />
        </div>

        {/* Breakdown Logs Table */}
        <div className="glass-card rounded-xl border border-[var(--border-subtle)] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-bold text-[var(--text-primary)]">Day-by-Day Telemetry Breakdown</h3>
              <p className="text-[12px] text-zinc-400">Detailed logs sorted chronologically</p>
            </div>
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter by date (YYYY-MM-DD)…"
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[var(--marketing-accent)]"
            />
          </div>

          <TableShell maxHeight="360px">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th right>Recorded Volume</Th>
                <Th right>Share of Period</Th>
                <Th right>Variance vs Daily Avg</Th>
              </tr>
            </thead>
            <tbody>
              {filteredDays.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs text-zinc-500">
                    No logs match this date query.
                  </td>
                </tr>
              ) : (
                filteredDays.map((row) => {
                  const sharePct = total > 0 ? ((row.value / total) * 100).toFixed(1) : "0.0";
                  const variancePct = avg > 0 ? (((row.value - avg) / avg) * 100).toFixed(1) : "0.0";
                  const isAboveAvg = Number(variancePct) >= 0;

                  return (
                    <tr key={row.label} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-2)]/60">
                      <td className="px-3.5 py-3 font-data text-zinc-300">
                        {row.label} ({formatDay(row.label)})
                      </td>
                      <td className="px-3.5 py-3 text-right font-data font-bold tabular-nums text-zinc-100">
                        {row.value.toLocaleString()} {config.unit}
                      </td>
                      <td className="px-3.5 py-3 text-right font-data tabular-nums text-zinc-400">
                        {sharePct}%
                      </td>
                      <td className="px-3.5 py-3 text-right font-data tabular-nums">
                        <span className={isAboveAvg ? "text-emerald-400" : "text-zinc-500"}>
                          {isAboveAvg ? `+${variancePct}%` : `${variancePct}%`}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </TableShell>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsDetailPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsDetailInner />
    </Suspense>
  );
}
