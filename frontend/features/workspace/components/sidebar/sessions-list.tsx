"use client";

import type { ChatSession } from "@/shared/types/chat";

interface SessionsListProps {
  sessions: ChatSession[];
  activeSessionId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onRename: (id: number, title: string) => void;
}

export function SessionsList({ sessions, activeSessionId, onSelect, onDelete, onRename }: SessionsListProps) {
  return (
    <div className="mt-6 flex-1 overflow-y-auto">
      <p className="mb-3 text-xs uppercase tracking-wide text-zinc-500">Sessions</p>
      <div className="space-y-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`rounded-xl border px-3 py-2 text-sm ${
              activeSessionId === session.id ? "border-white bg-white text-black" : "border-zinc-800 bg-zinc-900 text-zinc-100"
            }`}
          >
            <button className="w-full text-left" onClick={() => onSelect(session.id)}>
              {session.title}
            </button>
            <div className="mt-2 flex gap-2 text-xs">
              <button
                className="rounded bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700"
                onClick={() => {
                  const next = window.prompt("Rename session", session.title);
                  if (next && next.trim()) {
                    onRename(session.id, next.trim());
                  }
                }}
              >
                Rename
              </button>
              <button className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700" onClick={() => onDelete(session.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
