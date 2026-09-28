"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import ChatWindow from "@/features/chat/components/chat-window";
import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import { useAuthStore } from "@/stores/auth-store";
import { useDocumentStore } from "@/stores/document-store";
import { useSessionStore } from "@/stores/session-store";
import MainLayout from "@/components/layout/main-layout";
import { AtmosphereBackground } from "@/features/shared/components/atmosphere-background";
import { PageBackground } from "@/features/shared/components/page-background";
import { CursorSpotlight } from "@/features/shared/motion/motion";
import Sidebar from "@/features/workspace/components/sidebar/sidebar";
import { CommandPalette } from "@/components/ui/command-palette";
import { useDocuments } from "@/features/documents/hooks/use-documents";
import { useDocumentFile } from "@/features/documents/hooks/use-document-file";
import { useSessions } from "@/features/sessions/hooks/use-sessions";

const PdfViewer = dynamic(() => import("@/components/pdf/pdf-viewer"), { ssr: false });

/** The document-name header + PDF (or loading/error) body shared by both the wide-screen side
 * panel and the narrow-screen modal below — factored out so the two presentations can never
 * drift out of sync with each other. */
function DocumentPreviewBody({
  name,
  pdfBlobUrl,
  isPdfLoading,
  jumpToPage,
  jumpNonce,
  onClose,
}: {
  name: string;
  pdfBlobUrl: string | null;
  isPdfLoading: boolean;
  jumpToPage: number | null;
  jumpNonce: number | undefined;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5">
        <p className="min-w-0 truncate text-[12.5px] font-medium text-zinc-400">{name}</p>
        <button
          onClick={onClose}
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
          <PdfViewer file={pdfBlobUrl} jumpToPage={jumpToPage} jumpNonce={jumpNonce} />
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-zinc-500">
            {isPdfLoading ? "Loading PDF…" : "Unable to load PDF"}
          </div>
        )}
      </div>
    </>
  );
}

export default function ChatPage() {
  const { isReady, isAuthenticated } = useAuthGuard();
  const email = useAuthStore((s) => s.email);
  const selectedDocument = useDocumentStore((s) => s.selectedDocument);
  const setSelectedDocument = useDocumentStore((s) => s.setSelectedDocument);
  const pdfJumpRequest = useDocumentStore((s) => s.pdfJumpRequest);
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
        onOpenPalette={() => setPaletteOpen(true)}
        sidebarCollapsed={!sidebarOpen}
        background={
          <>
            <PageBackground page="research_copilot" dynamic={<AtmosphereBackground variant="vivid" />} />
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
            // Wide screens only (>= Tailwind's xl, 1280px): a side-by-side panel next to the
            // chat. Below that there simply isn't room for both — this used to just vanish
            // below xl with no message at all (a real user-reported bug, 2026-09-28: opening a
            // document on a laptop with a smaller/non-maximized window showed nothing, no error,
            // while the same document opened fine once that window was maximized past 1280px).
            // The modal below is the fallback for every viewport narrower than that.
            <div className="hidden w-[420px] shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--app-bg)] xl:flex">
              <DocumentPreviewBody
                name={documents.find((d) => d.id === selectedDocument)?.name.replace(/\.pdf$/i, "") ?? "Document"}
                pdfBlobUrl={pdfBlobUrl}
                isPdfLoading={isPdfLoading}
                jumpToPage={pdfJumpRequest?.documentId === selectedDocument ? pdfJumpRequest.page : null}
                jumpNonce={pdfJumpRequest?.nonce}
                onClose={() => setSelectedDocument("")}
              />
            </div>
          ) : null}
        </div>
      </MainLayout>

      {/* Narrow-viewport fallback (below xl, ~1280px) for the document preview — the side panel
          above is CSS-hidden there entirely, so without this, selecting a document on a smaller
          screen looked like nothing happened (see the comment above). A full-screen modal, not
          a squeezed-in panel: there isn't enough width to show it alongside the chat at these
          sizes, so it covers the chat instead, same as the profile/settings modal's own
          full-screen-on-narrow pattern. Portaled onto <body> for the same reason profile-modal
          is: an ancestor using backdrop-filter/transform would otherwise contain this
          `fixed inset-0`, clipping it to that ancestor's box instead of the real viewport. */}
      {selectedDocument &&
        createPortal(
          <div className="fixed inset-0 z-50 flex flex-col bg-[var(--app-bg)] xl:hidden">
            <DocumentPreviewBody
              name={documents.find((d) => d.id === selectedDocument)?.name.replace(/\.pdf$/i, "") ?? "Document"}
              pdfBlobUrl={pdfBlobUrl}
              isPdfLoading={isPdfLoading}
              jumpToPage={pdfJumpRequest?.documentId === selectedDocument ? pdfJumpRequest.page : null}
              jumpNonce={pdfJumpRequest?.nonce}
              onClose={() => setSelectedDocument("")}
            />
          </div>,
          document.body,
        )}

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
