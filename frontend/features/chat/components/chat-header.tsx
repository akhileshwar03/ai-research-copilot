"use client";

import { useSessionStore } from "@/stores/session-store";
import { useDocumentStore } from "@/stores/document-store";

export function ChatHeader() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const selectedDocument = useDocumentStore((s) => s.selectedDocument);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const title = activeSession?.title ?? "Research Session";

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.05] px-6 py-3.5">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[14px] font-semibold text-white/90">{title}</h2>
      </div>

      {/* Cmd+K hint */}
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))}
        className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.06] px-2 py-1 transition hover:border-white/[0.12] sm:flex"
        title="Open command palette"
      >
        <svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-[11px] text-zinc-700">Search</span>
        <div className="flex items-center gap-0.5">
          <kbd className="flex h-4 items-center rounded border border-white/[0.06] bg-white/[0.03] px-1 text-[9px] font-mono text-zinc-700">⌘</kbd>
          <kbd className="flex h-4 items-center rounded border border-white/[0.06] bg-white/[0.03] px-1 text-[9px] font-mono text-zinc-700">K</kbd>
        </div>
      </button>

      {selectedDocument && (
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1">
          <svg className="h-3 w-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-[11px] text-zinc-500">PDF attached</span>
        </div>
      )}
    </header>
  );
}
