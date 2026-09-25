"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/services/api/admin-api";
import { Button, HBar, formatBytes } from "@/features/admin/components/shared";
import { DynamicChart } from "@/features/admin/components/dynamic-chart";

export function UserAnalyticsDrawer({
  userId,
  userEmail,
  onClose,
  onScopeUser,
}: {
  userId: number;
  userEmail?: string;
  onClose: () => void;
  onScopeUser?: (userId: number, email: string) => void;
}) {
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ["admin-user-activity", userId],
    queryFn: () => adminApi.userActivity(userId),
  });

  const { data: userAnalytics } = useQuery({
    queryKey: ["admin-user-analytics", userId],
    queryFn: () => adminApi.analytics({ user_id: userId, days: 30 }),
  });

  const { data: docsData } = useQuery({
    queryKey: ["admin-user-documents", userId],
    queryFn: () => adminApi.userDocuments(userId),
  });

  const { data: sessionsData } = useQuery({
    queryKey: ["admin-user-sessions", userId],
    queryFn: () => adminApi.userSessions(userId),
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const email = userEmail || activity?.identities[0] || `User #${userId}`;
  const totalUserRequests = activity?.usage_30d.reduce((s, u) => s + u.requests, 0) ?? 0;
  const totalUserErrors = activity?.usage_30d.reduce((s, u) => s + u.errors, 0) ?? 0;
  const docs = docsData?.documents ?? [];
  const sessions = sessionsData?.sessions ?? [];

  const chartSeries = (userAnalytics?.series ?? []).map((d) => ({
    label: d.date,
    value: d.requests,
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="glass-panel flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--surface-1)] p-5 shadow-2xl scrollbar-thin sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-lg font-bold text-zinc-200 ring-1 ring-[var(--border-medium)]">
              {email.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-bold text-[var(--text-primary)]" title={email}>
                  {email}
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">
                User ID #{userId} {activity?.identities.length ? `· ${activity.identities.join(", ")}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onScopeUser && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  onScopeUser(userId, email);
                  onClose();
                }}
                title="Filter Overview command center to this user"
              >
                Scope Overview
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>

        {/* Telemetry Stat Strip */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">30d Requests</p>
            <p className="mt-1 font-data text-xl font-bold tabular-nums text-zinc-100">
              {totalUserRequests.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">30d Errors</p>
            <p className="mt-1 font-data text-xl font-bold tabular-nums text-rose-400">
              {totalUserErrors}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">Documents</p>
            <p className="mt-1 font-data text-xl font-bold tabular-nums text-zinc-100">{docs.length}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">Chat Sessions</p>
            <p className="mt-1 font-data text-xl font-bold tabular-nums text-zinc-100">{sessions.length}</p>
          </div>
        </div>

        {/* User Activity Trajectory Chart */}
        <div className="mt-5">
          <DynamicChart
            id={`user-${userId}-requests`}
            title="User Activity Timeline (Last 30 Days)"
            data={chartSeries}
            unit="reqs"
            height={160}
          />
        </div>

        {/* Usage Breakdown by Tool */}
        <div className="mt-6 space-y-2">
          <h4 className="text-[12px] font-bold uppercase tracking-wider text-zinc-400">
            Tool Breakdown (Last 30 Days)
          </h4>
          {activityLoading ? (
            <p className="py-4 text-center text-xs text-zinc-500">Loading tool telemetry…</p>
          ) : !activity || activity.usage_30d.length === 0 ? (
            <p className="py-4 text-center text-xs text-zinc-500">No tool requests in this window.</p>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)]/40 px-3">
              {activity.usage_30d.map((u) => (
                <div key={u.tool} className="py-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{u.label}</span>
                    <span className="font-data font-bold text-zinc-400">
                      {u.requests.toLocaleString()} reqs {u.errors > 0 && <span className="text-rose-400">({u.errors} err)</span>}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <HBar value={u.requests} max={totalUserRequests || 1} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Documents and Sessions */}
        <div className="mt-6 grid gap-4">
          <div>
            <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-zinc-400">
              Documents ({docs.length})
            </h4>
            <div className="max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin">
              {docs.length === 0 ? (
                <p className="text-xs text-zinc-500">No documents uploaded.</p>
              ) : (
                docs.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/30 px-3 py-2 text-xs"
                  >
                    <span className="truncate font-medium text-zinc-300" title={d.name}>
                      {d.name}
                    </span>
                    <span className="shrink-0 font-data text-zinc-500">{formatBytes(d.size_bytes)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-zinc-400">
              Chat Sessions ({sessions.length})
            </h4>
            <div className="max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin">
              {sessions.length === 0 ? (
                <p className="text-xs text-zinc-500">No chat sessions found.</p>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/30 px-3 py-2 text-xs"
                  >
                    <span className="truncate font-medium text-zinc-300" title={s.title}>
                      {s.pinned && "📌 "}
                      {s.title}
                    </span>
                    <span className="shrink-0 font-data text-zinc-500">{s.message_count} msgs</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
