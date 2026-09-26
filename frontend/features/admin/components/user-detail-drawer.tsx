"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminApi, type AdminUser } from "@/services/api/admin-api";
import { Badge, Button, HBar, formatBytes, formatDate, timeAgo } from "@/features/admin/components/shared";
import { DynamicChart } from "@/features/admin/components/dynamic-chart";

export function UserDetailDrawer({
  user,
  isSelf,
  onClose,
  onChanged,
}: {
  user: AdminUser;
  isSelf: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ["admin-user-activity", user.id],
    queryFn: () => adminApi.userActivity(user.id),
  });
  const { data: userAnalytics } = useQuery({
    queryKey: ["admin-user-analytics", user.id],
    queryFn: () => adminApi.analytics({ user_id: user.id, days: 30 }),
  });
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ["admin-user-documents", user.id],
    queryFn: () => adminApi.userDocuments(user.id),
  });
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ["admin-user-sessions", user.id],
    queryFn: () => adminApi.userSessions(user.id),
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-user-activity", user.id] });
    onChanged();
  };

  const revoke = useMutation({
    mutationFn: () => adminApi.revokeUserSessions(user.id),
    onSuccess: (res) => {
      toast.success(res.message);
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const verify = useMutation({
    mutationFn: (email_verified: boolean) => adminApi.patchUser(user.id, { email_verified }),
    onSuccess: (res) => {
      toast.success(res.message);
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const documents = docsData?.documents ?? [];
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
        className="glass-panel flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--surface-1)]! p-5 shadow-2xl scrollbar-thin sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-lg font-bold text-zinc-200 ring-1 ring-[var(--border-medium)]">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-bold text-[var(--text-primary)]" title={user.email}>
                  {user.email}
                </h3>
                {isSelf && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-[var(--marketing-accent-soft)] text-[var(--marketing-accent-text)]">
                    you
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-zinc-400">
                <Badge tone={user.is_active ? "good" : "bad"} dot>
                  {user.is_active ? "Active" : "Suspended"}
                </Badge>
                <Badge tone={user.is_admin ? "info" : "neutral"}>
                  {user.is_admin ? "Admin" : "Standard User"}
                </Badge>
                {!user.email_verified && <Badge tone="warn">Unverified</Badge>}
              </div>
              <p className="mt-1 text-[11.5px] text-zinc-400">
                Joined {formatDate(user.created_at)} · Last active {timeAgo(user.last_active_at)}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} title="Close drawer (Esc)">
            ✕
          </Button>
        </div>

        {/* Quick Operations Bar */}
        {!isSelf && (
          <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3">
            <Button
              onClick={() => revoke.mutate()}
              disabled={revoke.isPending}
              title="Revoke every refresh token — signs the user out on all devices within an hour"
              size="sm"
            >
              Sign out everywhere
              {activity && activity.active_refresh_tokens > 0 && (
                <span className="ml-1 rounded bg-[var(--surface-3)] px-1.5 py-0.2 text-[10px] font-bold text-zinc-300">
                  {activity.active_refresh_tokens} active
                </span>
              )}
            </Button>
            <Button
              onClick={() => verify.mutate(!user.email_verified)}
              disabled={verify.isPending}
              size="sm"
            >
              {user.email_verified ? "Mark email unverified" : "Mark email verified"}
            </Button>
          </div>
        )}

        {/* 30-Day Activity Chart */}
        <div className="mt-5">
          <DynamicChart
            id={`user-${user.id}-trajectory`}
            title="User activity (30 days)"
            data={chartSeries}
            unit="reqs"
            height={150}
          />
        </div>

        {/* Usage Breakdown */}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[12px] font-bold uppercase tracking-wider text-zinc-400">
              Tool Usage Breakdown
            </h4>
            {activity && (
              <span className="text-[11px] text-zinc-500 font-data">
                {activity.humanizer_runs} humanizer · {activity.realtime_sessions} realtime
              </span>
            )}
          </div>
          {activityLoading ? (
            <p className="text-xs text-zinc-500">Loading…</p>
          ) : !activity || activity.usage_30d.length === 0 ? (
            <p className="rounded-lg border border-[var(--border-subtle)] p-3 text-center text-xs text-zinc-500">
              No tool requests in the last 30 days.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {activity.usage_30d.map((u) => (
                <li
                  key={u.tool}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/40 p-2.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{u.label}</span>
                    <span className="font-data font-bold text-zinc-400">
                      {u.requests.toLocaleString()} reqs {u.errors > 0 && <span className="text-rose-400">({u.errors} err)</span>}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <HBar value={u.requests} max={activity.usage_30d[0]?.requests || 1} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Uploaded Documents List */}
        <div className="mt-6">
          <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-zinc-400">
            Documents ({documents.length})
          </h4>
          <div className="max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin">
            {docsLoading ? (
              <p className="text-xs text-zinc-500">Loading documents…</p>
            ) : documents.length === 0 ? (
              <p className="text-xs text-zinc-500">No documents uploaded.</p>
            ) : (
              documents.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/40 px-3 py-2 text-xs"
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

        {/* Chat Sessions List */}
        <div className="mt-6">
          <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-zinc-400">
            Chat Sessions ({sessions.length})
          </h4>
          <div className="max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin">
            {sessionsLoading ? (
              <p className="text-xs text-zinc-500">Loading sessions…</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-zinc-500">No chat sessions yet.</p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/40 px-3 py-2 text-xs"
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
  );
}
