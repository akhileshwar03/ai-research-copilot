"use client";

import { useCallback, useState } from "react";

import { ChatHeader } from "@/features/chat/components/chat-header";
import { ChatInput } from "@/features/chat/components/chat-input";
import { ChatMessageList } from "@/features/chat/components/chat-message-list";
import { useChat } from "@/features/chat/hooks/use-chat";

interface ChatWindowProps {
  email: string | null;
  selectedDocument: string;
  sidebarOpen?: boolean;
}

export default function ChatWindow({ email, selectedDocument, sidebarOpen = true }: ChatWindowProps) {
  const { input, setInput, sendMessage, cancelStreaming, retryLastMessage, isStreaming, activeSession, chatError } = useChat(email, selectedDocument);
  const [isDragging, setIsDragging] = useState(false);

  // Derive user initial from email for avatar
  const userInitial = email ? email[0].toUpperCase() : "?";

  // ── Drag & drop PDF ────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    const hasPdf = Array.from(e.dataTransfer.items).some(
      (item) => item.kind === "file" && (item.type === "application/pdf" || item.type === ""),
    );
    if (!hasPdf) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only hide overlay when leaving the root element (not a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type === "application/pdf");
    if (file) {
      window.dispatchEvent(new CustomEvent("upload-pdf", { detail: { file } }));
    }
  }, []);

  if (!activeSession) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--app-bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
          <p className="text-[12px] text-zinc-600">Loading workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full flex-col bg-[var(--app-bg)] text-white"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ChatHeader sidebarOpen={sidebarOpen} />

      {/* Error banner with Retry */}
      {chatError && (
        <div className="mx-6 mt-4 flex items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5">
          <svg className="h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="flex-1 text-[13px] text-red-300">{chatError}</p>
          <button
            onClick={retryLastMessage}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-[12px] font-medium text-red-300 transition hover:border-red-500/50 hover:bg-red-500/10"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry
          </button>
        </div>
      )}

      <ChatMessageList
        messages={activeSession.messages}
        isStreaming={isStreaming}
        userInitial={userInitial}
        onSuggestionClick={(text) => {
          setInput(text);
          setTimeout(() => {
            const el = document.getElementById("chat-input");
            if (el) (el as HTMLTextAreaElement).focus();
          }, 0);
        }}
      />
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={sendMessage}
        onCancel={cancelStreaming}
        isStreaming={isStreaming}
      />

      {/* Drag & drop overlay */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-none bg-[var(--app-bg)]/80 backdrop-blur-sm">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-white/30 bg-white/[0.04]">
            <svg className="h-9 w-9 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-[16px] font-medium text-white/70">Drop PDF to upload</p>
            <p className="mt-1 text-[13px] text-white/35">Release to add it to your documents</p>
          </div>
        </div>
      )}
    </div>
  );
}
