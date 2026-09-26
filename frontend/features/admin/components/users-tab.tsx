"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminApi, type AdminUser, type UserRoleFilter, type UserSort, type UserStatusFilter } from "@/services/api/admin-api";
import { Badge, Button, EmptyRow, INPUT_CLASS, Pager, ROW_CLASS, TableShell, TableSkeletonRows, Th, formatDate, timeAgo } from "@/features/admin/components/shared";
import { DynamicChart } from "@/features/admin/components/dynamic-chart";
import { downloadBlob } from "@/features/admin/lib/chart-export";
import { UserDetailDrawer } from "@/features/admin/components/user-detail-drawer";

export function UsersTab({ currentEmail }: { currentEmail: string | undefined }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UserStatusFilter>("all");
  const [role, setRole] = useState<UserRoleFilter>("all");
  const [sort, setSort] = useState<UserSort>("newest");
  const [skip, setSkip] = useState(0);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  // Density & Column Chooser state
  const [density, setDensity] = useState<"compact" | "normal">("normal");
  const [visibleCols, setVisibleCols] = useState({
    docs: true,
    sessions: true,
    lastActive: true,
    joined: true,
  });
  const [showColMenu, setShowColMenu] = useState(false);

  const limit = 50;

  const params = { skip, limit, q: search, status, role, sort };
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-users", params],
    queryFn: () => adminApi.users(params),
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.stats(),
    refetchInterval: 60_000,
  });

  const { data: analytics } = useQuery({
    queryKey: ["admin-analytics", { days: 30 }],
    queryFn: () => adminApi.analytics({ days: 30 }),
    refetchInterval: 120_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
  };

  const patchMutation = useMutation({
    mutationFn: ({
      userId,
      patch,
    }: {
      userId: number;
      patch: { is_active?: boolean; is_admin?: boolean };
    }) => adminApi.patchUser(userId, patch),
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

  const bulkDeleteMutation = useMutation({
    mutationFn: (userIds: number[]) => adminApi.bulkDeleteUsers(userIds),
    onSuccess: (res) => {
      if (res.deleted.length > 0) {
        toast.success(`Deleted ${res.deleted.length} user${res.deleted.length === 1 ? "" : "s"}`);
      }
      if (res.failed.length > 0) {
        toast.error(
          `${res.failed.length} could not be deleted: ${res.failed.map((f) => f.error).join("; ")}`,
          { duration: 6000 },
        );
      }
      setCheckedIds(new Set());
      setSelectedUser(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Bulk delete failed"),
  });

  const toggleChecked = (userId: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleBulkDelete = () => {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    if (
      window.confirm(
        `Permanently delete ${ids.length} user${ids.length === 1 ? "" : "s"} and ALL their data (documents, chats, everything)? This cannot be undone.`,
      )
    ) {
      bulkDeleteMutation.mutate(ids);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await adminApi.exportUsers({ q: search, status, role });
      downloadBlob(blob, `querex-users-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success("CSV downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  };

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const selectClass = `${INPUT_CLASS} py-1.5 text-zinc-300 font-medium cursor-pointer`;

  const drawerUser = selectedUser
    ? users.find((u) => u.id === selectedUser.id) ?? selectedUser
    : null;

  const selectableUsers = users.filter(
    (u) => currentEmail?.toLowerCase() !== u.email.toLowerCase(),
  );
  const allSelectableChecked =
    selectableUsers.length > 0 && selectableUsers.every((u) => checkedIds.has(u.id));
  const someSelectableChecked = selectableUsers.some((u) => checkedIds.has(u.id));

  const toggleSelectAll = () => {
    setCheckedIds((prev) => {
      if (allSelectableChecked) {
        const next = new Set(prev);
        selectableUsers.forEach((u) => next.delete(u.id));
        return next;
      }
      const next = new Set(prev);
      selectableUsers.forEach((u) => next.add(u.id));
      return next;
    });
  };

  return (
    <section className="space-y-4">
      {/* Visual Analytics Strip for Users */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <DynamicChart
          id="users-signup-trend"
          title="30-Day Registrations"
          subtitle="New sign-ups recorded daily"
          data={(analytics?.series ?? []).map((d) => ({ label: d.date, value: d.signups }))}
          color="#059669"
          unit="users"
          height={140}
        />
        <DynamicChart
          id="users-role-distribution"
          title="Role Distribution"
          subtitle="Administrative vs standard users"
          data={[
            { label: "Admin Users", value: stats?.admin_users ?? 0, color: "#d9793a" },
            {
              label: "Standard Users",
              value: Math.max(0, (stats?.total_users ?? 0) - (stats?.admin_users ?? 0)),
              color: "#0284c7",
            },
          ]}
          height={140}
          isComposition={true}
        />
        <DynamicChart
          id="users-status-distribution"
          title="Account Status"
          subtitle="Active vs suspended standing"
          data={[
            { label: "Active", value: stats?.active_users ?? 0, color: "#059669" },
            { label: "Suspended", value: stats?.suspended_users ?? 0, color: "#e11d48" },
          ]}
          height={140}
          isComposition={true}
        />
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-headline text-[15px] font-bold text-[var(--text-primary)]">
            Users
          </h2>
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-bold font-data text-zinc-300">
            {total.toLocaleString()} total
          </span>

          {/* Quick Filter Presets */}
          <div className="hidden sm:flex items-center gap-1 ml-2">
            <button
              type="button"
              onClick={() => {
                setStatus("all");
                setRole("all");
                setSearch("");
                setSkip(0);
              }}
              className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                status === "all" && role === "all" && !search
                  ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)] ring-1 ring-[var(--border-medium)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => {
                setRole("admin");
                setSkip(0);
              }}
              className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                role === "admin"
                  ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)] ring-1 ring-[var(--border-medium)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Admins
            </button>
            <button
              type="button"
              onClick={() => {
                setStatus("suspended");
                setSkip(0);
              }}
              className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                status === "suspended"
                  ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)] ring-1 ring-[var(--border-medium)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Suspended
            </button>
          </div>
        </div>

        {checkedIds.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 shadow-xs">
            <span className="text-[12.5px] font-bold text-rose-300">
              {checkedIds.size} selected
            </span>
            <Button size="sm" variant="ghost" onClick={() => setCheckedIds(new Set())}>
              Clear
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending
                ? "Deleting…"
                : `Delete ${checkedIds.size} selected`}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </span>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSkip(0);
                }}
                placeholder="Search email…"
                className={`${INPUT_CLASS} w-44 pl-8 pr-7 sm:w-56`}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSkip(0);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Status Dropdown */}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as UserStatusFilter);
                setSkip(0);
              }}
              className={selectClass}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>

            {/* Role Dropdown */}
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as UserRoleFilter);
                setSkip(0);
              }}
              className={selectClass}
            >
              <option value="all">All roles</option>
              <option value="admin">Admins</option>
              <option value="user">Users</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as UserSort);
                setSkip(0);
              }}
              className={selectClass}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="email">Email A–Z</option>
            </select>

            {/* Density Toggle */}
            <div className="flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-0.5">
              <button
                type="button"
                onClick={() => setDensity("compact")}
                className={`rounded px-2 py-1 text-[11px] font-bold ${
                  density === "compact"
                    ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="Compact density"
              >
                Compact
              </button>
              <button
                type="button"
                onClick={() => setDensity("normal")}
                className={`rounded px-2 py-1 text-[11px] font-bold ${
                  density === "normal"
                    ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="Normal density"
              >
                Normal
              </button>
            </div>

            {/* Column Chooser Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColMenu((p) => !p)}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[11px] font-bold text-zinc-300 hover:bg-[var(--surface-2)]"
                title="Choose visible columns"
              >
                Cols ▾
              </button>
              {showColMenu && (
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-1)] p-2.5 shadow-xl">
                  <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
                    Visible Columns
                  </p>
                  <div className="space-y-1.5 text-xs text-zinc-300">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleCols.docs}
                        onChange={(e) => setVisibleCols((c) => ({ ...c, docs: e.target.checked }))}
                      />
                      <span>Documents</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleCols.sessions}
                        onChange={(e) => setVisibleCols((c) => ({ ...c, sessions: e.target.checked }))}
                      />
                      <span>Sessions</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleCols.lastActive}
                        onChange={(e) => setVisibleCols((c) => ({ ...c, lastActive: e.target.checked }))}
                      />
                      <span>Last Active</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleCols.joined}
                        onChange={(e) => setVisibleCols((c) => ({ ...c, joined: e.target.checked }))}
                      />
                      <span>Joined Date</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Refresh & CSV Buttons */}
            <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "…" : "Refresh"}
            </Button>
            <Button size="sm" onClick={handleExport}>
              CSV
            </Button>
          </div>
        )}
      </div>

      {/* Dense Users Table */}
      <TableShell>
        <thead>
          <tr>
            <Th className="w-10">
              <input
                type="checkbox"
                checked={allSelectableChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someSelectableChecked && !allSelectableChecked;
                }}
                onChange={toggleSelectAll}
                onClick={(e) => e.stopPropagation()}
                title="Select all"
                className="h-4 w-4 rounded border-[var(--border-medium)] bg-[var(--surface-2)] text-[var(--marketing-accent)] focus:ring-[var(--marketing-accent)]"
              />
            </Th>
            <Th
              className="cursor-pointer hover:text-[var(--text-primary)]"
              onClick={() => {
                setSort((s) => (s === "email" ? "newest" : "email"));
                setSkip(0);
              }}
              title="Click to sort by email"
            >
              Email &amp; Identity {sort === "email" ? "▲" : ""}
            </Th>
            <Th>Status</Th>
            <Th>Role</Th>
            {visibleCols.docs && <Th right>Docs</Th>}
            {visibleCols.sessions && <Th right>Sessions</Th>}
            {visibleCols.lastActive && <Th>Last Active</Th>}
            {visibleCols.joined && (
              <Th
                className="cursor-pointer hover:text-[var(--text-primary)]"
                onClick={() => {
                  setSort((s) => (s === "newest" ? "oldest" : "newest"));
                  setSkip(0);
                }}
                title="Click to toggle newest/oldest"
              >
                Joined {sort === "newest" ? "▼" : sort === "oldest" ? "▲" : ""}
              </Th>
            )}
            <Th right>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <TableSkeletonRows colSpan={9} rows={8} />
          ) : users.length === 0 ? (
            <EmptyRow colSpan={9}>
              {search || status !== "all" || role !== "all"
                ? "No users match your current search/filters."
                : "No users exist in the system yet."}
            </EmptyRow>
          ) : (
            users.map((user) => {
              const isSelf = currentEmail?.toLowerCase() === user.email.toLowerCase();
              const pyClass = density === "compact" ? "py-1.5" : "py-2.5 sm:py-3";

              return (
                <tr
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className={`cursor-pointer ${ROW_CLASS}`}
                >
                  {/* Select Checkbox */}
                  <td className={`px-3.5 ${pyClass}`} onClick={(e) => e.stopPropagation()}>
                    {!isSelf ? (
                      <input
                        type="checkbox"
                        checked={checkedIds.has(user.id)}
                        onChange={() => toggleChecked(user.id)}
                        className="h-4 w-4 rounded border-[var(--border-medium)] bg-[var(--surface-2)] text-[var(--marketing-accent)] focus:ring-[var(--marketing-accent)]"
                      />
                    ) : (
                      <div className="h-4 w-4" />
                    )}
                  </td>

                  {/* Email */}
                  <td className={`px-3.5 ${pyClass}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[11px] font-bold text-zinc-300">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-zinc-200" title={user.email}>
                        {user.email}
                      </span>
                      {isSelf && (
                        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-[var(--marketing-accent-soft)] text-[var(--marketing-accent-text)]">
                          you
                        </span>
                      )}
                      {!user.email_verified && <Badge tone="warn">unverified</Badge>}
                    </div>
                  </td>

                  {/* Status */}
                  <td className={`px-3.5 ${pyClass}`}>
                    <Badge tone={user.is_active ? "good" : "bad"} dot>
                      {user.is_active ? "active" : "suspended"}
                    </Badge>
                  </td>

                  {/* Role */}
                  <td className={`px-3.5 ${pyClass}`}>
                    {user.is_admin ? (
                      <Badge tone="info">admin</Badge>
                    ) : (
                      <span className="text-zinc-400">user</span>
                    )}
                  </td>

                  {/* Documents count */}
                  {visibleCols.docs && (
                    <td className={`px-3.5 ${pyClass} text-right font-data font-semibold tabular-nums text-zinc-300`}>
                      {user.document_count}
                    </td>
                  )}

                  {/* Chat sessions count */}
                  {visibleCols.sessions && (
                    <td className={`px-3.5 ${pyClass} text-right font-data font-semibold tabular-nums text-zinc-300`}>
                      {user.session_count}
                    </td>
                  )}

                  {/* Last Active */}
                  {visibleCols.lastActive && (
                    <td className={`px-3.5 ${pyClass} text-zinc-400`} title={formatDate(user.last_active_at)}>
                      {timeAgo(user.last_active_at)}
                    </td>
                  )}

                  {/* Joined Date */}
                  {visibleCols.joined && (
                    <td className={`px-3.5 ${pyClass} text-zinc-400`}>
                      {user.created_at ? new Date(user.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                  )}

                  {/* Actions */}
                  <td className={`px-3.5 ${pyClass}`} onClick={(e) => e.stopPropagation()}>
                    {isSelf ? (
                      <div className="flex justify-end">
                        <span className="rounded px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                          Owner
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedUser(user)}
                          title="Open full user activity"
                        >
                          Analyze
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            patchMutation.mutate({
                              userId: user.id,
                              patch: { is_active: !user.is_active },
                            })
                          }
                          title={user.is_active ? "Suspend" : "Reinstate"}
                        >
                          {user.is_active ? "Suspend" : "Reinstate"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            patchMutation.mutate({
                              userId: user.id,
                              patch: { is_admin: !user.is_admin },
                            })
                          }
                          title={user.is_admin ? "Demote" : "Make admin"}
                        >
                          {user.is_admin ? "Demote" : "Promote"}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDelete(user)}
                          title="Delete user"
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableShell>

      {/* Drawer */}
      {drawerUser && (
        <UserDetailDrawer
          user={drawerUser}
          isSelf={currentEmail?.toLowerCase() === drawerUser.email.toLowerCase()}
          onClose={() => setSelectedUser(null)}
          onChanged={invalidate}
        />
      )}

      {/* Pagination */}
      <Pager skip={skip} limit={limit} total={total} onChange={setSkip} />
    </section>
  );
}
