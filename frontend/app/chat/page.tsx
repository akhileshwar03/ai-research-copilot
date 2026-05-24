"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import ChatWindow from "@/features/chat/components/chat-window";
import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import { useAuthStore } from "@/stores/auth-store";
import { useDocumentStore } from "@/stores/document-store";
import { useSessionStore } from "@/stores/session-store";
import MainLayout from "@/components/layout/main-layout";
import Sidebar from "@/features/workspace/components/sidebar/sidebar";
import { CommandPalette } from "@/components/ui/command-palette";
import { buildStaticUrl } from "@/constants/config";
import { useDocuments } from "@/features/documents/hooks/use-documents";
import { useSessions, makeDefaultSession } from "@/features/sessions/hooks/use-sessions";
import { sessionsApi } from "@/services/api/sessions-api";

const PdfViewer = dynamic(() => import("@/components/pdf/pdf-viewer"), { ssr: false });

export default function ChatPage() {
  const { isReady, isAuthenticated } = useAuthGuard();
  const email = useAuthStore((s) => s.email);
  const selectedDocument = useDocumentStore((s) => s.selectedDocument);
  const setSelectedDocument = useDocumentStore((s) => s.setSelectedDocument);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);
  const setSessions = useSessionStore((s) => s.setSessions);

  const { documents } = useDocuments();
  const { createSession } = useSessions(email);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  // ── Cmd+K shortcut ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleNewSession = useCallback(async () => {
    const draft = makeDefaultSession();
    setSessions([draft, ...sessions]);
    setActiveSessionId(draft.id);
    if (email) {
      try {
        const created = await createSession(draft);
        const persisted = { ...draft, id: created.id };
        setSessions([persisted, ...sessions]);
        setActiveSessionId(persisted.id);
      } catch {/* silently ignore */}
    }
  }, [sessions, setSessions, setActiveSessionId, email, createSession]);

  // Trigger hidden file input for palette "Upload PDF" action
  const handlePaletteUpload = useCallback(() => {
    uploadRef.current?.click();
  }, []);

  if (!isReady || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#080808]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
          <p className="text-[12px] text-zinc-600">Loading workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <MainLayout sidebar={<Sidebar email={email} />}>
        <div className="flex h-full">
          <div className="flex-1 overflow-hidden">
            <ChatWindow email={email} selectedDocument={selectedDocument} />
          </div>

          {selectedDocument ? (
            <div className="hidden w-[420px] shrink-0 border-l border-white/[0.05] bg-[#0a0a0a] xl:block">
              <PdfViewer file={buildStaticUrl(`/uploads/${selectedDocument}`)} />
            </div>
          ) : null}
        </div>
      </MainLayout>

      {/* Command palette — Cmd+K */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        sessions={sessions}
        documents={documents}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewSession={handleNewSession}
        onSelectDocument={setSelectedDocument}
        onUploadDocument={handlePaletteUpload}
      />

      {/* Hidden upload trigger for palette */}
      <input
        ref={uploadRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            // Reuse sidebar upload — dispatch a custom event the sidebar listens to
            window.dispatchEvent(new CustomEvent("upload-pdf", { detail: { file } }));
          }
          e.target.value = "";
        }}
      />
    </>
  );
}
