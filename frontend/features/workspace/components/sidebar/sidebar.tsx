"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DocumentsPanel } from "@/features/documents/components/documents-panel";
import { SessionsPanel } from "@/features/sessions/components/sessions-panel";
import { useDocuments } from "@/features/documents/hooks/use-documents";
import { useSessions, makeDefaultSession } from "@/features/sessions/hooks/use-sessions";
import { useSessionStore } from "@/stores/session-store";
import type { SessionsResponse } from "@/shared/types/api";
import { Glare } from "@/features/shared/motion/motion";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { WorkspaceProfileFooter } from "@/components/layout/workspace-profile-footer";

interface WorkspaceSidebarProps {
  email: string | null;
  onOpenPalette?: () => void;
}

export default function WorkspaceSidebar({ email, onOpenPalette }: WorkspaceSidebarProps) {
  const queryClient = useQueryClient();
  const { sessions, activeSessionId, setActiveSessionId, setSessions, createSession, updateSession, deleteSession, isLoadingSessions, retentionDays: sessionRetentionDays } = useSessions(email);
  const { documents, retentionDays, uploadDocument, isUploadingDocument, isLoadingDocuments, deleteDocument } = useDocuments(email);
  const [isCreating, setIsCreating] = useState(false);

  // Handle drag-drop uploads dispatched by ChatWindow and command-palette palette uploads
  useEffect(() => {
    const handler = (e: Event) => {
      const file = (e as CustomEvent<{ file: File }>).detail?.file;
      if (file) uploadDocument(file).catch(() => {});
    };
    window.addEventListener("upload-pdf", handler);
    return () => window.removeEventListener("upload-pdf", handler);
  // uploadDocument identity is stable (useMutation), safe to exclude
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewSession = async () => {
    setIsCreating(true);
    try {
      // Stamp created_at immediately (rather than waiting for a refetch to
      // pick up the server's value) so the sessions panel's "expires in Nd"
      // caption renders right away instead of staying blank until the next
      // full sessions list reload.
      const draft = { ...makeDefaultSession(), created_at: new Date().toISOString() };
      // Read current sessions from store to avoid stale closure
      const currentSessions = useSessionStore.getState().sessions;
      setSessions([draft, ...currentSessions]);
      setActiveSessionId(draft.id);

      if (email) {
        const created = await createSession(draft);
        const persisted = { ...draft, id: created.id };

        // Cancel any in-flight ["sessions"] fetch before writing — otherwise
        // a slower, older response (e.g. one already queued when this call
        // started) could resolve afterward and silently overwrite this
        // session with a pre-message snapshot, making it appear blank.
        await queryClient.cancelQueries({ queryKey: ["sessions"] });

        // Read again — state may have changed during the async call
        const latestSessions = useSessionStore.getState().sessions;
        setSessions([persisted, ...latestSessions.filter((s) => s.id !== draft.id)]);
        setActiveSessionId(persisted.id);

        queryClient.setQueryData<SessionsResponse>(["sessions"], (old) => {
          if (!old) return old;
          return { ...old, sessions: [persisted, ...old.sessions.filter((s) => s.id !== draft.id && s.id !== persisted.id)] };
        });
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

  const handlePinSession = async (id: number, pinned: boolean) => {
    const target = sessions.find((s) => s.id === id);
    if (!target) return;
    const updated = { ...target, pinned };
    setSessions(sessions.map((s) => (s.id === id ? updated : s)));
    if (email) await updateSession(updated);
  };

  return (
    <Glare className="glass-panel flex h-full flex-col overflow-hidden">
      <WorkspaceNav onOpenPalette={onOpenPalette} />

      {/* ── Scrollable body ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5 scrollbar-thin">
        {/* Documents */}
        <DocumentsPanel
          documents={documents}
          onUpload={async (file) => { await uploadDocument(file); }}
          onDelete={async (id) => { await deleteDocument(id); }}
          isUploading={isUploadingDocument}
          isLoading={isLoadingDocuments}
          retentionDays={retentionDays}
        />

        {/* Divider */}
        <div className="h-px bg-[var(--border-subtle)]" />

        {/* Sessions */}
        <SessionsPanel
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
          onDelete={handleDeleteSession}
          onRename={handleRenameSession}
          onPin={handlePinSession}
          onNewSession={handleNewSession}
          isCreating={isCreating}
          isLoading={isLoadingSessions}
          retentionDays={sessionRetentionDays}
        />
      </div>

      <WorkspaceProfileFooter />
    </Glare>
  );
}
