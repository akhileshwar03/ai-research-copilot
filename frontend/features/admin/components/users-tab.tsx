"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  adminApi,
  type AdminUser,
  type UserRoleFilter,
  type UserSort,
  type UserStatusFilter,
} from "@/services/api/admin-api";
import {
  Badge,
  Button,
  EmptyRow,
  INPUT_CLASS,
  Pager,
  ROW_CLASS,
  THEAD_CLASS,
  TableShell,
  Th,
  formatBytes,
  formatDate,
  statusTone,
  timeAgo,
} from "@/features/admin/components/shared";

function UserDetailDrawer({
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
  const { data: activity } = useQuery({ queryKey: ["admin-user-activity", user.id], queryFn: () => adminApi.userActivity(user.id) });
  const { data: docsData, isLoading: docsLoading } = useQuery({ queryKey: ["admin-user-documents", user.id], queryFn: () => adminApi.userDocuments(user.id) });
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({ queryKey: ["admin-user-sessions", user.id], queryFn: () => adminApi.userSessions(user.id) });

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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="glass-panel flex h-full w-full max-w-lg flex-col overflow-y-auto border-l p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">{user.email}</h3>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              {user.is_admin ? "Admin" : "User"} · {user.is_active ? "Active" : "Suspended"} · joined {formatDate(user.created_at)}
            </p>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              Last active {timeAgo(user.last_active_at)}
              {activity && ` · signs in with ${activity.identities.join(", ") || "—"}`}
            </p>
          </div>
          <Button onClick={onClose}>Close</Button>
        </div>

        {!isSelf && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => revoke.mutate()} disabled={revoke.isPending} title="Revoke every refresh token — signs the user out on all devices within an hour">
              Sign out everywhere
              {activity && activity.active_refresh_tokens > 0 && <Badge>{activity.active_refresh_tokens} active</Badge>}
            </Button>
            <Button onClick={() => verify.mutate(!user.email_verified)} disabled={verify.isPending}>
              {user.email_verified ? "Mark email unverified" : "Mark email verified"}
            </Button>
          </div>
        )}

        <div className="mt-6">
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Usage (last 30 days)</h4>
          {!activity ? (
            <p className="text-[13px] text-zinc-500">Loading…</p>
          ) : activity.usage_30d.length === 0 ? (
            <p className="text-[13px] text-zinc-600">No tool requests in the last 30 days.</p>
          ) : (
            <ul className="space-y-1">
              {activity.usage_30d.map((u) => (
                <li key={u.tool} className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1.5 text-[12.5px]">
                  <span className="text-zinc-300">{u.label}</span>
                  <span className="tabular-nums text-zinc-500">
                    {u.requests} req{u.errors > 0 && <span className="ml-1.5 text-red-400">· {u.errors} err</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {activity && (
            <p className="mt-2 text-[11px] text-zinc-600">
              {activity.humanizer_runs} humanizer runs saved · {activity.realtime_sessions} real-time chats
            </p>
          )}
        </div>

        <div className="mt-6">
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Documents ({documents.length})</h4>
          <div className="space-y-1.5">
            {docsLoading ? (
              <p className="text-[13px] text-zinc-500">Loading…</p>
            ) : documents.length === 0 ? (
              <p className="text-[13px] text-zinc-600">No documents uploaded.</p>
            ) : (
              documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-zinc-200">{d.name}</p>
                    <p className="text-[11px] text-zinc-500">
                      {formatBytes(d.size_bytes)}
                      {d.page_count != null && ` · ${d.page_count} pages`} · {formatDate(d.created_at)}
                      {!d.file_exists && <span className="text-red-400"> · file missing in storage</span>}
                      {d.error_message && <span className="text-red-400"> · {d.error_message}</span>}
                    </p>
                  </div>
                  <Badge tone={statusTone(d.upload_status)}>{d.upload_status}</Badge>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-6">
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Chat sessions ({sessions.length})</h4>
          <div className="space-y-1.5">
            {sessionsLoading ? (
              <p className="text-[13px] text-zinc-500">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="text-[13px] text-zinc-600">No chat sessions yet.</p>
            ) : (
              sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2">
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

export function UsersTab({ currentEmail }: { currentEmail: string | undefined }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UserStatusFilter>("all");
  const [role, setRole] = useState<UserRoleFilter>("all");
  const [sort, setSort] = useState<UserSort>("newest");
  const [skip, setSkip] = useState(0);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const limit = 50;

  const params = { skip, limit, q: search, status, role, sort };
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-users", params],
    queryFn: () => adminApi.users(params),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
  };

  const patchMutation = useMutation({
    mutationFn: ({ userId, patch }: { userId: number; patch: { is_active?: boolean; is_admin?: boolean } }) => adminApi.patchUser(userId, patch),
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
      setSelectedUser(null);
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

  const handleExport = async () => {
    try {
      const blob = await adminApi.exportUsers({ q: search, status, role });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `querex-users-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  };

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const selectClass = `${INPUT_CLASS} py-1.5`;

  // Keep the drawer's user in sync with the freshly fetched list after an action.
  const drawerUser = selectedUser ? users.find((u) => u.id === selectedUser.id) ?? selectedUser : null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-headline text-[15px] font-bold text-zinc-200">Users ({total})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSkip(0);
            }}
            placeholder="Search by email…"
            className={`${INPUT_CLASS} w-56`}
          />
          <select value={status} onChange={(e) => { setStatus(e.target.value as UserStatusFilter); setSkip(0); }} className={selectClass}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <select value={role} onChange={(e) => { setRole(e.target.value as UserRoleFilter); setSkip(0); }} className={selectClass}>
            <option value="all">All roles</option>
            <option value="admin">Admins</option>
            <option value="user">Users</option>
          </select>
          <select value={sort} onChange={(e) => { setSort(e.target.value as UserSort); setSkip(0); }} className={selectClass}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="email">Email A–Z</option>
          </select>
          <Button onClick={() => refetch()} disabled={isFetching} title="Refresh user list">
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          <Button onClick={handleExport} title="Download the filtered list as CSV">Export CSV</Button>
        </div>
      </div>

      <TableShell>
        <thead className={THEAD_CLASS}>
          <tr>
            <Th>Email</Th>
            <Th>Status</Th>
            <Th>Role</Th>
            <Th right>Docs</Th>
            <Th right>Sessions</Th>
            <Th>Last active</Th>
            <Th>Joined</Th>
            <Th right>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <EmptyRow colSpan={8}>Loading users…</EmptyRow>
          ) : users.length === 0 ? (
            <EmptyRow colSpan={8}>{search || status !== "all" || role !== "all" ? "No users match these filters" : "No users yet"}</EmptyRow>
          ) : (
            users.map((user) => {
              const isSelf = currentEmail?.toLowerCase() === user.email.toLowerCase();
              return (
                <tr key={user.id} onClick={() => setSelectedUser(user)} className={`cursor-pointer ${ROW_CLASS}`}>
                  <td className="px-3 py-2.5 text-zinc-200">
                    {user.email}
                    {isSelf && (
                      <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}>
                        you
                      </span>
                    )}
                    {!user.email_verified && <span className="ml-2"><Badge tone="warn">unverified</Badge></span>}
                  </td>
                  <td className="px-3 py-2.5"><Badge tone={user.is_active ? "good" : "bad"}>{user.is_active ? "active" : "suspended"}</Badge></td>
                  <td className="px-3 py-2.5 text-zinc-400">{user.is_admin ? <Badge tone="info">admin</Badge> : "user"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{user.document_count}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{user.session_count}</td>
                  <td className="px-3 py-2.5 text-zinc-500">{timeAgo(user.last_active_at)}</td>
                  <td className="px-3 py-2.5 text-zinc-500">{user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2.5">
                    {isSelf ? (
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[11px] text-zinc-600" title="You can't suspend, demote, or delete your own account from here">Manage from Settings</span>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button onClick={() => patchMutation.mutate({ userId: user.id, patch: { is_active: !user.is_active } })}>
                          {user.is_active ? "Suspend" : "Reinstate"}
                        </Button>
                        <Button onClick={() => patchMutation.mutate({ userId: user.id, patch: { is_admin: !user.is_admin } })}>
                          {user.is_admin ? "Demote" : "Make admin"}
                        </Button>
                        <Button variant="danger" onClick={() => handleDelete(user)}>Delete</Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableShell>

      {drawerUser && (
        <UserDetailDrawer
          user={drawerUser}
          isSelf={currentEmail?.toLowerCase() === drawerUser.email.toLowerCase()}
          onClose={() => setSelectedUser(null)}
          onChanged={invalidate}
        />
      )}

      <Pager skip={skip} limit={limit} total={total} onChange={setSkip} />
    </section>
  );
}
