"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import {
  adminApi,
  type AdminSetting,
  type AdminUser,
} from "@/services/api/admin-api";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

const SETTING_LABELS: Record<string, string> = {
  max_upload_size_mb: "Maximum upload size (MB)",
  rag_top_k: "Retrieved chunks per query (top-k)",
  rag_similarity_threshold: "Similarity threshold (0–2, lower = stricter)",
  chat_rate_limit_per_minute: "Chat rate limit (requests/min per IP)",
  upload_rate_limit_per_minute: "Upload rate limit (requests/min per IP)",
  retention_days: "Data retention window (days, 0 = keep forever)",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <div className="flex items-center gap-1.5 text-zinc-500">
        <span style={{ color: "var(--marketing-accent-text)" }}>{icon}</span>
        <p className="text-[11px] uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1.5 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function UserDetailDrawer({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ["admin-user-documents", user.id],
    queryFn: () => adminApi.userDocuments(user.id),
  });
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ["admin-user-sessions", user.id],
    queryFn: () => adminApi.userSessions(user.id),
  });

  const documents = docsData?.documents ?? [];
  const sessions = sessionsData?.sessions ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--modal-bg)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">{user.email}</h3>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              {user.is_admin ? "Admin" : "User"} · {user.is_active ? "Active" : "Suspended"} · joined{" "}
              {formatDate(user.created_at)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[12px] text-zinc-400 hover-surface"
          >
            Close
          </button>
        </div>

        <div className="mt-6">
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
            Documents ({documents.length})
          </h4>
          <div className="space-y-1.5">
            {docsLoading ? (
              <p className="text-[13px] text-zinc-500">Loading…</p>
            ) : documents.length === 0 ? (
              <p className="text-[13px] text-zinc-600">No documents uploaded.</p>
            ) : (
              documents.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-zinc-200">{d.name}</p>
                    <p className="text-[11px] text-zinc-500">
                      {formatBytes(d.size_bytes)} · {formatDate(d.created_at)}
                      {!d.file_exists && " · file missing on disk"}
                    </p>
                  </div>
                  <span
                    className={[
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                      d.upload_status === "ready"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : d.upload_status === "processing"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-red-500/10 text-red-400",
                    ].join(" ")}
                  >
                    {d.upload_status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-6">
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
            Chat sessions ({sessions.length})
          </h4>
          <div className="space-y-1.5">
            {sessionsLoading ? (
              <p className="text-[13px] text-zinc-500">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="text-[13px] text-zinc-600">No chat sessions yet.</p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-zinc-200">
                      {s.pinned && "📌 "}
                      {s.title}
                    </p>
                    <p className="text-[11px] text-zinc-500">{formatDate(s.created_at)}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-zinc-500">{s.message_count} msgs</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersSection({ currentEmail }: { currentEmail: string | undefined }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const limit = 50;

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-users", skip, search],
    queryFn: () => adminApi.users(skip, limit, search),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const patchMutation = useMutation({
    mutationFn: ({ userId, patch }: { userId: number; patch: { is_active?: boolean; is_admin?: boolean } }) =>
      adminApi.patchUser(userId, patch),
    onSuccess: (res) => {
      toast.success(res.message);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => adminApi.deleteUser(userId),
    onSuccess: (res) => {
      toast.success(res.message);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  const handleDelete = (user: AdminUser) => {
    if (
      window.confirm(
        `Permanently delete ${user.email} and ALL their data (${user.document_count} documents, ${user.session_count} sessions)? This cannot be undone.`,
      )
    ) {
      deleteMutation.mutate(user.id);
    }
  };

  const users = data?.users ?? [];
  const total = data?.total ?? 0;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-zinc-200">Users ({total})</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh user list"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[12px] text-zinc-400 hover-surface disabled:opacity-50"
          >
            <svg className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSkip(0);
            }}
            placeholder="Search by email…"
            className="w-64 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus-accent"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Role</th>
              <th className="px-3 py-2.5 text-right">Docs</th>
              <th className="px-3 py-2.5 text-right">Sessions</th>
              <th className="px-3 py-2.5">Joined</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  Loading users…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  {search ? `No users match "${search}"` : "No users yet"}
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const isSelf = currentEmail?.toLowerCase() === user.email.toLowerCase();
                return (
                <tr
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className="cursor-pointer border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-2)]"
                >
                  <td className="px-4 py-2.5 text-zinc-200">
                    {user.email}
                    {isSelf && (
                      <span
                        className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
                      >
                        you
                      </span>
                    )}
                    {!user.email_verified && (
                      <span className="ml-2 rounded bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-500">
                        unverified
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={
                        user.is_active
                          ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-400"
                          : "rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-400"
                      }
                    >
                      {user.is_active ? "active" : "suspended"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-400">{user.is_admin ? "admin" : "user"}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-400">{user.document_count}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-400">{user.session_count}</td>
                  <td className="px-3 py-2.5 text-zinc-500">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {isSelf ? (
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[11px] text-zinc-600" title="You can't suspend, demote, or delete your own account from here">
                          Manage from Settings
                        </span>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() =>
                            patchMutation.mutate({ userId: user.id, patch: { is_active: !user.is_active } })
                          }
                          className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-zinc-300 hover-surface"
                        >
                          {user.is_active ? "Suspend" : "Reinstate"}
                        </button>
                        <button
                          onClick={() =>
                            patchMutation.mutate({ userId: user.id, patch: { is_admin: !user.is_admin } })
                          }
                          className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-zinc-300 hover-surface"
                        >
                          {user.is_admin ? "Demote" : "Make admin"}
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          className="rounded-md border border-red-500/30 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedUser && <UserDetailDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />}

      {total > limit && (
        <div className="mt-3 flex items-center justify-end gap-2 text-[12px] text-zinc-500">
          <button
            disabled={skip === 0}
            onClick={() => setSkip(Math.max(0, skip - limit))}
            className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-zinc-300 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            {skip + 1}–{Math.min(skip + limit, total)} of {total}
          </span>
          <button
            disabled={skip + limit >= total}
            onClick={() => setSkip(skip + limit)}
            className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-zinc-300 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

function SettingsSection() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => adminApi.settings(),
  });
  const [draft, setDraft] = useState<Record<string, string>>({});

  const saveMutation = useMutation({
    mutationFn: (changed: Record<string, number>) => adminApi.updateSettings(changed),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["admin-settings"], fresh);
      setDraft({});
      toast.success("Settings saved — takes effect within 30 seconds");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  const handleSave = () => {
    const changed: Record<string, number> = {};
    for (const [key, raw] of Object.entries(draft)) {
      const setting = settings?.find((s) => s.key === key);
      if (!setting) continue;
      const parsed = setting.type === "int" ? parseInt(raw, 10) : parseFloat(raw);
      if (Number.isNaN(parsed)) {
        toast.error(`${key}: not a valid number`);
        return;
      }
      if (parsed !== setting.value) changed[key] = parsed;
    }
    if (Object.keys(changed).length === 0) {
      toast.info("No changes to save");
      return;
    }
    saveMutation.mutate(changed);
  };

  return (
    <section>
      <h2 className="mb-3 text-[15px] font-semibold text-zinc-200">Runtime limits</h2>
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
        {isLoading ? (
          <p className="py-4 text-center text-[13px] text-zinc-500">Loading settings…</p>
        ) : (
          <div className="space-y-4">
            {(settings ?? []).map((setting: AdminSetting) => {
              const currentValue = draft[setting.key] ?? String(setting.value);
              const atDefault = parseFloat(currentValue) === setting.default;
              return (
                <div key={setting.key} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-zinc-200">
                      {SETTING_LABELS[setting.key] ?? setting.key}
                    </p>
                    <p className="text-[12px] text-zinc-500">
                      {setting.description} · range {setting.min}–{setting.max} · default {setting.default}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!atDefault && (
                      <button
                        onClick={() => setDraft((d) => ({ ...d, [setting.key]: String(setting.default) }))}
                        title="Reset to default"
                        className="rounded-lg border border-[var(--border-subtle)] px-2 py-1.5 text-[11px] text-zinc-500 hover-surface"
                      >
                        Reset
                      </button>
                    )}
                    <input
                      type="number"
                      min={setting.min}
                      max={setting.max}
                      step={setting.type === "int" ? 1 : 0.05}
                      value={currentValue}
                      onChange={(e) => setDraft((d) => ({ ...d, [setting.key]: e.target.value }))}
                      className="w-28 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-right text-[13px] text-zinc-200 focus-accent"
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex justify-end border-t border-[var(--border-subtle)] pt-4">
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="rounded-lg bg-white px-4 py-1.5 text-[13px] font-medium text-black hover:bg-zinc-200 disabled:opacity-50"
              >
                {saveMutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { isReady, isAuthenticated } = useAuthGuard();

  const { data: me, isLoading: isMeLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => adminApi.me(),
    enabled: isReady && isAuthenticated,
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.stats(),
    enabled: Boolean(me?.is_admin),
    refetchInterval: 60_000,
  });

  if (!isReady || !isAuthenticated || isMeLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--app-bg)]">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--marketing-accent)" }}
        />
      </div>
    );
  }

  if (me && !me.is_admin) {
    router.replace("/chat");
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--app-bg)] px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
            >
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a7.723 7.723 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a7.688 7.688 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">Admin panel</h1>
              <p className="mt-0.5 text-[13px] text-zinc-500">
                Signed in as {me?.email} · changes are logged
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push("/chat")}
            className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[13px] text-zinc-300 hover-surface"
          >
            ← Back to app
          </button>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Users"
            value={stats?.total_users ?? "—"}
            icon={<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>}
          />
          <StatCard
            label="Active"
            value={stats?.active_users ?? "—"}
            icon={<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard
            label="Documents"
            value={stats?.total_documents ?? "—"}
            icon={<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>}
          />
          <StatCard
            label="Storage"
            value={stats ? formatBytes(stats.total_storage_bytes) : "—"}
            icon={<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>}
          />
          <StatCard
            label="Sessions"
            value={stats?.total_sessions ?? "—"}
            icon={<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>}
          />
          <StatCard
            label="Messages"
            value={stats?.total_messages ?? "—"}
            icon={<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>}
          />
        </section>

        <UsersSection currentEmail={me?.email} />
        <SettingsSection />
      </div>
    </div>
  );
}
