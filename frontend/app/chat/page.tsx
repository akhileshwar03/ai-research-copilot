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
import { useDocuments } from "@/features/documents/hooks/use-documents";
import { useDocumentFile } from "@/features/documents/hooks/use-document-file";
import { useSessions, makeDefaultSession } from "@/features/sessions/hooks/use-sessions";

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

  const { documents } = useDocuments(email);
  const { createSession } = useSessions(email);
  const { blobUrl: pdfBlobUrl, isLoading: isPdfLoading } = useDocumentFile(selectedDocument || null);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const uploadRef = useRef<HTMLInputElement>(null);

  // ── Sidebar toggle via custom event (dispatched by ChatHeader button) ───────
  useEffect(() => {
    const handler = () => setSidebarOpen((o) => !o);
    window.addEventListener("toggle-sidebar", handler);
    return () => window.removeEventListener("toggle-sidebar", handler);
  }, []);

  // ── Settings modal open via custom event ────────────────────────────────────
  // Dispatched by ⌘+, shortcut below
  useEffect(() => {
    // Keyboard shortcuts
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      switch (e.key) {
        case "k":
          e.preventDefault();
          setPaletteOpen((o) => !o);
          break;
        case "b":
          e.preventDefault();
          setSidebarOpen((o) => !o);
          break;
        case "n":
          e.preventDefault();
          handleNewSession();
          break;
        case "/":
          e.preventDefault();
          document.getElementById("chat-input")?.focus();
          break;
        case ",":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("open-settings"));
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, setSessions, setActiveSessionId, email, createSession]);

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
      <div className="flex h-screen items-center justify-center bg-[var(--app-bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
          <p className="text-[12px] text-zinc-600">Loading workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <MainLayout sidebar={<Sidebar email={email} />} sidebarCollapsed={!sidebarOpen}>
        <div className="flex h-full">
          <div className="flex-1 overflow-hidden">
            <ChatWindow
              email={email}
              documents={documents}
              sidebarOpen={sidebarOpen}
            />
          </div>

          {selectedDocument ? (
            <div className="hidden w-[420px] shrink-0 border-l border-[var(--border-subtle)] bg-[var(--app-bg)] xl:block">
              {pdfBlobUrl ? (
                <PdfViewer file={pdfBlobUrl} />
              ) : (
                <div className="flex h-full items-center justify-center text-[13px] text-zinc-500">
                  {isPdfLoading ? "Loading PDF…" : "Unable to load PDF"}
                </div>
              )}
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
            window.dispatchEvent(new CustomEvent("upload-pdf", { detail: { file } }));
          }
          e.target.value = "";
        }}
      />
    </>
  );
}
