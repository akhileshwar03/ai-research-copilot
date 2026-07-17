"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import {
  adminApi,
  type AdminSetting,
  type AdminUser,
} from "@/services/api/admin-api";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-white/[0.02] p-4">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function UsersSection() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const limit = 50;

  const { data, isLoading } = useQuery({
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
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSkip(0);
          }}
          placeholder="Search by email…"
          className="w-64 rounded-lg border border-[var(--border-subtle)] bg-white/[0.03] px-3 py-1.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:border-white/20 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-[var(--border-subtle)] bg-white/[0.02] text-[11px] uppercase tracking-wide text-zinc-500">
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
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className="px-4 py-2.5 text-zinc-200">
                    {user.email}
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
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() =>
                          patchMutation.mutate({ userId: user.id, patch: { is_active: !user.is_active } })
                        }
                        className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.05]"
                      >
                        {user.is_active ? "Suspend" : "Reinstate"}
                      </button>
                      <button
                        onClick={() =>
                          patchMutation.mutate({ userId: user.id, patch: { is_admin: !user.is_admin } })
                        }
                        className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.05]"
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white/[0.02] p-4">
        {isLoading ? (
          <p className="py-4 text-center text-[13px] text-zinc-500">Loading settings…</p>
        ) : (
          <div className="space-y-4">
            {(settings ?? []).map((setting: AdminSetting) => (
              <div key={setting.key} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-zinc-200">{setting.key}</p>
                  <p className="text-[12px] text-zinc-500">
                    {setting.description} · range {setting.min}–{setting.max} · default {setting.default}
                  </p>
                </div>
                <input
                  type="number"
                  min={setting.min}
                  max={setting.max}
                  step={setting.type === "int" ? 1 : 0.05}
                  value={draft[setting.key] ?? String(setting.value)}
                  onChange={(e) => setDraft((d) => ({ ...d, [setting.key]: e.target.value }))}
                  className="w-28 shrink-0 rounded-lg border border-[var(--border-subtle)] bg-white/[0.03] px-3 py-1.5 text-right text-[13px] text-zinc-200 focus:border-white/20 focus:outline-none"
                />
              </div>
            ))}
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
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
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Admin panel</h1>
            <p className="mt-0.5 text-[13px] text-zinc-500">
              Signed in as {me?.email} · changes are logged
            </p>
          </div>
          <button
            onClick={() => router.push("/chat")}
            className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[13px] text-zinc-300 hover:bg-white/[0.05]"
          >
            ← Back to app
          </button>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Users" value={stats?.total_users ?? "—"} />
          <StatCard label="Active" value={stats?.active_users ?? "—"} />
          <StatCard label="Documents" value={stats?.total_documents ?? "—"} />
          <StatCard label="Storage" value={stats ? formatBytes(stats.total_storage_bytes) : "—"} />
          <StatCard label="Sessions" value={stats?.total_sessions ?? "—"} />
          <StatCard label="Messages" value={stats?.total_messages ?? "—"} />
        </section>

        <UsersSection />
        <SettingsSection />
      </div>
    </div>
  );
}
