"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

import type { ChatSession } from "@/shared/types/chat";
import { useSessionStore } from "@/stores/session-store";
import { SessionSkeleton } from "@/components/ui/skeleton";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SessionsPanelProps {
  sessions: ChatSession[];
  activeSessionId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => Promise<void>;
  onRename: (id: number, title: string) => Promise<void>;
  onPin: (id: number, pinned: boolean) => Promise<void>;
  onNewSession: () => Promise<void>;
  isCreating?: boolean;
  isLoading?: boolean;
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

function CheckIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
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

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  return (
    <input
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); if (text.trim()) onSave(text.trim()); }
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => { if (text.trim() && text.trim() !== value) onSave(text.trim()); else onCancel(); }}
      className="w-full truncate rounded bg-white/[0.06] px-1 py-0.5 text-[12px] font-medium text-white outline-none ring-1 ring-white/20 focus:ring-white/40"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function SessionsPanel({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
  onRename,
  onPin,
  onNewSession,
  isCreating = false,
  isLoading = false,
}: SessionsPanelProps) {
  const { sortOrder, setSortOrder, togglePin } = useSessionStore();
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? sessions.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    : sessions;

  const sorted = [...filtered].sort((a, b) => {
    const aPinned = a.pinned ?? false;
    const bPinned = b.pinned ?? false;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (sortOrder === "alpha") return a.title.localeCompare(b.title);
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
      toast.error("Failed to delete session");
    } finally {
      setDeletingId(null);
    }
  };

  const handleRename = async (id: number, title: string) => {
    setRenamingId(null);
    try {
      await onRename(id, title);
    } catch {
      toast.error("Failed to rename session");
    }
  };

  const renderSession = (session: ChatSession) => {
    const isActive = activeSessionId === session.id;
    const isRenaming = renamingId === session.id;
    const isDeleting = deletingId === session.id;
    const isPinned = session.pinned ?? false;

    return (
      <div
        key={session.id}
        className={[
          "group relative flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all duration-150",
          isActive
            ? "border-white/20 bg-white/[0.07]"
            : "border-[var(--border-subtle)] bg-[var(--surface-1)] hover:border-[var(--border-medium)] hover:bg-white/[0.04]",
          isDeleting ? "opacity-40 pointer-events-none" : "",
        ].join(" ")}
      >
        {/* Active indicator stripe */}
        {isActive && (
          <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-white/60" />
        )}

        {/* Icon */}
        <span className={isActive ? "text-zinc-300" : "text-zinc-600 group-hover:text-zinc-500"}>
          <ChatBubbleIcon />
        </span>

        {/* Title / rename input */}
        <button
          onClick={() => !isRenaming && onSelect(session.id)}
          className="flex min-w-0 flex-1 items-center text-left"
          disabled={isRenaming}
        >
          {isRenaming ? (
            <InlineRename
              value={session.title}
              onSave={(v) => handleRename(session.id, v)}
              onCancel={() => setRenamingId(null)}
            />
          ) : (
            <span className={[
              "truncate text-[12px] font-medium leading-snug",
              isActive ? "text-white" : "text-zinc-400 group-hover:text-zinc-300",
            ].join(" ")}>
              {session.title}
            </span>
          )}
        </button>

        {/* Pin indicator */}
        {isPinned && !isRenaming && (
          <span className="shrink-0 text-amber-500/60">
            <PinIcon filled />
          </span>
        )}

        {/* Context menu */}
        {!isRenaming && (
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-700 opacity-0 transition group-hover:opacity-100 hover:bg-white/[0.08] hover:text-zinc-300 focus:opacity-100"
              >
                <DotsIcon />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Session</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => { setRenamingId(session.id); }}>
                <PencilIcon />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={async () => {
                togglePin(session.id);
                try {
                  await onPin(session.id, !isPinned);
                  toast.success(isPinned ? "Unpinned" : "Pinned to top");
                } catch {
                  togglePin(session.id); // roll back on failure
                  toast.error("Failed to update pin");
                }
              }}>
                <PinIcon filled={isPinned} />
                {isPinned ? "Unpin" : "Pin to top"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={() => handleDelete(session.id, session.title)}>
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
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Chats</span>
        <div className="flex items-center gap-1">
          {/* Sort dropdown */}
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300"
                title="Sort sessions"
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

          {/* New chat button */}
          <button
            onClick={onNewSession}
            disabled={isCreating}
            title="New chat"
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300 disabled:opacity-40"
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      {/* Search */}
      {sessions.length > 4 && (
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search sessions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-white/[0.02] py-1.5 pl-7 pr-3 text-[11px] text-zinc-400 placeholder-zinc-700 outline-none transition focus:border-[var(--border-strong)] focus:text-zinc-300"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-700 hover:text-zinc-400">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Session list */}
      {isLoading ? (
        <div className="flex flex-col gap-1">
          <SessionSkeleton />
          <SessionSkeleton />
          <SessionSkeleton />
          <SessionSkeleton />
        </div>
      ) : sorted.length === 0 && !search ? (
        <button
          onClick={onNewSession}
          disabled={isCreating}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.07] bg-[var(--surface-0)] px-4 py-6 text-center transition hover:border-white/[0.14] hover:bg-white/[0.02] disabled:opacity-50"
        >
          <ChatBubbleIcon />
          <span className="text-[12px] text-zinc-600">{isCreating ? "Creating…" : "Start a new chat"}</span>
        </button>
      ) : sorted.length === 0 && search ? (
        <p className="py-4 text-center text-[12px] text-zinc-700">No sessions match "{search}"</p>
      ) : (
        <div className="flex flex-col gap-1">
          {/* Pinned section */}
          {pinnedSessions.length > 0 && (
            <div className="mb-1">
              <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-widest text-amber-600/60">Pinned</p>
              <div className="flex flex-col gap-1">
                {pinnedSessions.map(renderSession)}
              </div>
            </div>
          )}

          {/* Recent section */}
          {pinnedSessions.length > 0 && unpinnedSessions.length > 0 && (
            <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-widest text-zinc-700">Recent</p>
          )}
          <div className="flex flex-col gap-1">
            {unpinnedSessions.map(renderSession)}
          </div>
        </div>
      )}
    </div>
  );
}
