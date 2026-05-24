"use client";

import { useState } from "react";

import { DocumentsPanel } from "@/features/documents/components/documents-panel";
import { SessionsPanel } from "@/features/sessions/components/sessions-panel";
import { useDocuments } from "@/features/documents/hooks/use-documents";
import { useSessions, makeDefaultSession } from "@/features/sessions/hooks/use-sessions";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useSessionStore } from "@/stores/session-store";

interface WorkspaceSidebarProps {
  email: string | null;
}

export default function WorkspaceSidebar({ email }: WorkspaceSidebarProps) {
  const { logout } = useAuth();
  const { sessions, activeSessionId, setActiveSessionId, setSessions, createSession, updateSession, deleteSession } = useSessions(email);
  const { documents, uploadDocument, isUploadingDocument, deleteDocument } = useDocuments();
  const upsertSession = useSessionStore((s) => s.upsertSession);

  const [isCreating, setIsCreating] = useState(false);

  const handleNewSession = async () => {
    setIsCreating(true);
    try {
      const draft = makeDefaultSession();
      // Optimistically add
      setSessions([draft, ...sessions]);
      setActiveSessionId(draft.id);

      if (email) {
        const created = await createSession(draft);
        const persisted = { ...draft, id: created.id };
        setSessions([persisted, ...sessions]);
        setActiveSessionId(persisted.id);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSession = async (id: number) => {
    await deleteSession(id);
    const next = sessions.filter((s) => s.id !== id);
    setSessions(next);
    if (activeSessionId === id) {
      setActiveSessionId(next[0]?.id ?? null);
    }
  };

  const handleRenameSession = async (id: number, title: string) => {
    const target = sessions.find((s) => s.id === id);
    if (!target) return;
    const updated = { ...target, title };
    setSessions(sessions.map((s) => (s.id === id ? updated : s)));
    if (email) await updateSession(updated);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0a0a0a]">
      {/* ── Brand header ──────────────────────────────── */}
      <div className="shrink-0 border-b border-white/[0.05] px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08]">
            <svg className="h-4 w-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-white/90 leading-tight">Research Copilot</p>
            <p className="text-[10px] text-zinc-600 leading-tight">AI workspace</p>
          </div>
        </div>
      </div>

      {/* ── Scrollable body ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5 scrollbar-thin">
        {/* Documents */}
        <DocumentsPanel
          documents={documents}
          onUpload={async (file) => { await uploadDocument(file); }}
          onDelete={async (id) => { await deleteDocument(id); }}
          isUploading={isUploadingDocument}
        />

        {/* Divider */}
        <div className="h-px bg-white/[0.05]" />

        {/* Sessions */}
        <SessionsPanel
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
          onDelete={handleDeleteSession}
          onRename={handleRenameSession}
          onNewSession={handleNewSession}
          isCreating={isCreating}
        />
      </div>

      {/* ── User footer ───────────────────────────────── */}
      <div className="shrink-0 border-t border-white/[0.05] px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-white/[0.03]">
          {/* Avatar */}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-semibold uppercase text-zinc-300 ring-1 ring-white/[0.06]">
            {email ? email[0] : "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] text-zinc-300">{email || "Not signed in"}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="shrink-0 rounded-lg p-1.5 text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
