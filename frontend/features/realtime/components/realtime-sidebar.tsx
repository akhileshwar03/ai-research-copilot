"use client";

import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";

import type { RealtimeSessionSummary } from "@/services/api/realtime-api";
import { SessionSkeleton } from "@/components/ui/skeleton";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { WorkspaceProfileFooter } from "@/components/layout/workspace-profile-footer";
import { CheckIcon, PlusIcon } from "@/features/shared/components/icons";

type SortOrder = "latest" | "alpha";

interface RealtimeSidebarProps {
  sessions: RealtimeSessionSummary[];
  activeSessionId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => Promise<void>;
  onRename: (id: number, title: string) => Promise<void>;
  onPin: (id: number, pinned: boolean) => Promise<void>;
  onNewSession: () => void;
  isLoading?: boolean;
  retentionDays?: number;
}

function daysUntilExpiry(createdAt: string | null | undefined, retentionDays: number): number | null {
  if (!createdAt || retentionDays <= 0) return null;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return null;
  const expiresAt = created + retentionDays * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

function SortIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
    </svg>
  );
}

function PinIcon({ filled }: { filled?: boolean }) {
  return (
    <svg className="h-3.5 w-3.5" fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function InlineRename({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (text.trim()) onSave(text.trim());
        }
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => {
        if (text.trim() && text.trim() !== value) onSave(text.trim());
        else onCancel();
      }}
      className="w-full truncate rounded bg-[var(--surface-2)] px-1 py-0.5 text-[12px] font-medium text-[var(--text-primary)] outline-none ring-1 ring-[var(--border-medium)] focus:ring-[var(--border-strong)]"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function RealtimeSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
  onRename,
  onPin,
  onNewSession,
  isLoading = false,
  retentionDays = 0,
}: RealtimeSidebarProps) {
  const [sortOrder, setSortOrder] = useState<SortOrder>("latest");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? sessions.filter((s) => (s.title ?? "").toLowerCase().includes(search.toLowerCase()))
    : sessions;

  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sortOrder === "alpha") return (a.title ?? "").localeCompare(b.title ?? "");
    return 0; // preserve server order (already latest-first)
  });

  const pinnedSessions = sorted.filter((s) => s.pinned);
  const unpinnedSessions = sorted.filter((s) => !s.pinned);

  const handleDelete = async (id: number, title: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
      toast.success(`"${title}" deleted`);
    } catch {
      toast.error("Failed to delete conversation");
    } finally {
      setDeletingId(null);
    }
  };

  const handleRename = async (id: number, title: string) => {
    setRenamingId(null);
    try {
      await onRename(id, title);
    } catch {
      toast.error("Failed to rename conversation");
    }
  };

  const renderSession = (session: RealtimeSessionSummary) => {
    const isActive = activeSessionId === session.id;
    const isRenaming = renamingId === session.id;
    const isDeleting = deletingId === session.id;
    const daysLeft = daysUntilExpiry(session.created_at, retentionDays);
    const expiresSoon = daysLeft !== null && daysLeft <= 2;

    return (
      <div
        key={session.id}
        className={[
          "group relative flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all duration-150",
          isActive
            ? "border-[var(--border-medium)] bg-[var(--surface-2)]"
            : "hover-surface border-[var(--border-subtle)] bg-[var(--surface-1)] hover:border-[var(--border-medium)]",
          isDeleting ? "pointer-events-none opacity-40" : "",
        ].join(" ")}
      >
        {isActive && (
          <div
            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: "var(--marketing-accent)" }}
          />
        )}

        <span style={isActive ? { color: "var(--marketing-accent-text)" } : undefined} className={!isActive ? "text-zinc-600 group-hover:text-zinc-500" : ""}>
          <GlobeIcon />
        </span>

        <button
          onClick={() => !isRenaming && onSelect(session.id)}
          className="flex min-w-0 flex-1 items-center text-left"
          disabled={isRenaming}
        >
          {isRenaming ? (
            <InlineRename
              value={session.title ?? "Untitled"}
              onSave={(v) => handleRename(session.id, v)}
              onCancel={() => setRenamingId(null)}
            />
          ) : (
            <div className="min-w-0">
              <span
                className={[
                  "block truncate text-[12px] font-medium leading-snug",
                  isActive ? "text-white" : "text-zinc-400 group-hover:text-zinc-300",
                ].join(" ")}
              >
                {session.title || "Untitled"}
              </span>
              {daysLeft !== null && (
                <span className={["text-[10px]", expiresSoon ? "text-amber-500/90" : "text-zinc-700"].join(" ")}>
                  {daysLeft === 0 ? "expires today" : `expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`}
                </span>
              )}
            </div>
          )}
        </button>

        {session.pinned && !isRenaming && (
          <span className="shrink-0 text-amber-500/60">
            <PinIcon filled />
          </span>
        )}

        {!isRenaming && (
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="hover-surface flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-700 opacity-0 transition group-hover:opacity-100 hover:text-zinc-300 focus:opacity-100"
              >
                <DotsIcon />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Conversation</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setRenamingId(session.id)}>
                <PencilIcon />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await onPin(session.id, !session.pinned);
                    toast.success(session.pinned ? "Unpinned" : "Pinned to top");
                  } catch {
                    toast.error("Failed to update pin");
                  }
                }}
              >
                <PinIcon filled={session.pinned} />
                {session.pinned ? "Unpin" : "Pin to top"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={() => handleDelete(session.id, session.title || "Untitled")}>
                <TrashIcon />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuRoot>
        )}
      </div>
    );
  };

  return (
    <div className="glass-panel relative z-10 flex h-full flex-col overflow-hidden">
      <WorkspaceNav />

      <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Conversations</span>
          <div className="flex items-center gap-1">
            <DropdownMenuRoot>
              <DropdownMenuTrigger asChild>
                <button
                  className="hover-surface flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 transition hover:text-zinc-300"
                  title="Sort conversations"
                >
                  <SortIcon />
                  <span>{sortOrder === "latest" ? "Latest" : "A–Z"}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setSortOrder("latest")}>
                  <span className={sortOrder === "latest" ? "text-white" : ""}>Latest added</span>
                  {sortOrder === "latest" && <CheckIcon />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortOrder("alpha")}>
                  <span className={sortOrder === "alpha" ? "text-white" : ""}>Alphabetical</span>
                  {sortOrder === "alpha" && <CheckIcon />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuRoot>

            <button
              onClick={onNewSession}
              title="New conversation"
              className="hover-surface flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 transition hover:text-zinc-300"
            >
              <PlusIcon />
            </button>
          </div>
        </div>

        {sessions.length > 4 && (
          <div className="relative mb-2">
            <svg className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search conversations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] py-1.5 pl-7 pr-3 text-[11px] text-zinc-400 placeholder-zinc-700 outline-none transition focus:border-[var(--border-strong)] focus:text-zinc-300"
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-1">
            <SessionSkeleton />
            <SessionSkeleton />
            <SessionSkeleton />
          </div>
        ) : sorted.length === 0 && !search ? (
          <button
            onClick={onNewSession}
            className="hover-surface flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-0)] px-4 py-6 text-center transition hover:border-[var(--border-medium)]"
          >
            <GlobeIcon />
            <span className="text-[12px] text-zinc-600">Start a conversation</span>
          </button>
        ) : sorted.length === 0 && search ? (
          <p className="py-4 text-center text-[12px] text-zinc-700">No conversations match &quot;{search}&quot;</p>
        ) : (
          <div className="flex flex-col gap-1">
            {pinnedSessions.length > 0 && (
              <div className="mb-1">
                <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-widest text-amber-600/60">Pinned</p>
                <div className="flex flex-col gap-1">{pinnedSessions.map(renderSession)}</div>
              </div>
            )}
            {pinnedSessions.length > 0 && unpinnedSessions.length > 0 && (
              <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-widest text-zinc-700">Recent</p>
            )}
            <div className="flex flex-col gap-1">{unpinnedSessions.map(renderSession)}</div>
          </div>
        )}
      </div>

      <WorkspaceProfileFooter />
    </div>
  );
}
