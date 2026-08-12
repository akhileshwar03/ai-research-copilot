"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import ChatWindow from "@/features/chat/components/chat-window";
import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import { useAuthStore } from "@/stores/auth-store";
import { useDocumentStore } from "@/stores/document-store";
import { useSessionStore } from "@/stores/session-store";
import MainLayout from "@/components/layout/main-layout";
import { AtmosphereBackground } from "@/features/shared/components/atmosphere-background";
import { CursorSpotlight } from "@/features/shared/motion/motion";
import Sidebar from "@/features/workspace/components/sidebar/sidebar";
import { CommandPalette } from "@/components/ui/command-palette";
import { useDocuments } from "@/features/documents/hooks/use-documents";
import { useDocumentFile } from "@/features/documents/hooks/use-document-file";
import { useSessions } from "@/features/sessions/hooks/use-sessions";

const PdfViewer = dynamic(() => import("@/components/pdf/pdf-viewer"), { ssr: false });

export default function ChatPage() {
  const { isReady, isAuthenticated } = useAuthGuard();
  const email = useAuthStore((s) => s.email);
  const selectedDocument = useDocumentStore((s) => s.selectedDocument);
  const setSelectedDocument = useDocumentStore((s) => s.setSelectedDocument);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);

  const { documents } = useDocuments(email);
  // The same createNewSession the sidebar's "+" button uses — previously
  // this page hand-rolled a second, buggier copy (stale closures, no race
  // guards against a slower in-flight ["sessions"] fetch) just for ⌘N/⌘K,
  // so the two entry points behaved differently. Now there's exactly one
  // "start a new chat" implementation, shared via useSessions(email).
  const { createNewSession } = useSessions(email);
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

  const handleNewSession = useCallback(async () => {
    await createNewSession();
  }, [createNewSession]);

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
  }, [handleNewSession]);

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
      <MainLayout
        sidebar={<Sidebar email={email} onOpenPalette={() => setPaletteOpen(true)} />}
        sidebarCollapsed={!sidebarOpen}
        background={
          <>
            <AtmosphereBackground variant="vivid" />
            <CursorSpotlight color="138,90,110" />
          </>
        }
      >
        <div className="flex h-full">
          <div className="flex-1 overflow-hidden">
            <ChatWindow
              email={email}
              documents={documents}
              sidebarOpen={sidebarOpen}
            />
          </div>

          {selectedDocument ? (
            <div className="hidden w-[420px] shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--app-bg)] xl:flex">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5">
                <p className="min-w-0 truncate text-[12.5px] font-medium text-zinc-400">
                  {documents.find((d) => d.id === selectedDocument)?.name.replace(/\.pdf$/i, "") ?? "Document"}
                </p>
                <button
                  onClick={() => setSelectedDocument("")}
                  title="Close panel"
                  aria-label="Close panel"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-600 transition hover:bg-[var(--surface-2)] hover:text-zinc-300"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {pdfBlobUrl ? (
                  <PdfViewer file={pdfBlobUrl} />
                ) : (
                  <div className="flex h-full items-center justify-center text-[13px] text-zinc-500">
                    {isPdfLoading ? "Loading PDF…" : "Unable to load PDF"}
                  </div>
                )}
              </div>
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
