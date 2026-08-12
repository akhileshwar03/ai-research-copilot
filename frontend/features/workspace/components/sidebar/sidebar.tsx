"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { DocumentsPanel } from "@/features/documents/components/documents-panel";
import { SessionsPanel } from "@/features/sessions/components/sessions-panel";
import { useDocuments } from "@/features/documents/hooks/use-documents";
import { useSessions } from "@/features/sessions/hooks/use-sessions";
import { Glare } from "@/features/shared/motion/motion";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { WorkspaceProfileFooter } from "@/components/layout/workspace-profile-footer";

interface WorkspaceSidebarProps {
  email: string | null;
  onOpenPalette?: () => void;
}

export default function WorkspaceSidebar({ email, onOpenPalette }: WorkspaceSidebarProps) {
  const {
    sessions, activeSessionId, setActiveSessionId, setSessions, updateSession, deleteSession,
    createNewSession, isCreatingSession, isLoadingSessions, retentionDays: sessionRetentionDays,
  } = useSessions(email);
  const { documents, retentionDays, uploadDocument, isUploadingDocument, isLoadingDocuments, deleteDocument, setDocumentPinned } = useDocuments(email);

  // Handle drag-drop uploads dispatched by ChatWindow and command-palette palette uploads
  useEffect(() => {
    const handler = (e: Event) => {
      const file = (e as CustomEvent<{ file: File }>).detail?.file;
      if (!file) return;
      // A failure here (e.g. the duplicate-name rejection) used to vanish
      // silently — drag-drop/palette upload was the only entry point in
      // the app that gave zero feedback on error, so a user hitting the
      // new name-collision check this way would see literally nothing
      // happen with no idea why.
      uploadDocument(file).catch((err) => {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      });
    };
    window.addEventListener("upload-pdf", handler);
    return () => window.removeEventListener("upload-pdf", handler);
  // uploadDocument identity is stable (useMutation), safe to exclude
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          onTogglePin={async (id, pinned) => { await setDocumentPinned(id, pinned); }}
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
          onNewSession={async () => { await createNewSession(); }}
          isCreating={isCreatingSession}
          isLoading={isLoadingSessions}
          retentionDays={sessionRetentionDays}
        />
      </div>

      <WorkspaceProfileFooter />
    </Glare>
  );
}
