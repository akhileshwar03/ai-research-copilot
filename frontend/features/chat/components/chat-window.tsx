"use client";

import { useCallback, useMemo, useState } from "react";

import { ChatHeader } from "@/features/chat/components/chat-header";
import { ChatInput } from "@/features/chat/components/chat-input";
import { ChatMessageList } from "@/features/chat/components/chat-message-list";
import { useChat } from "@/features/chat/hooks/use-chat";
import { visibleChatMessages } from "@/features/chat/lib/messages";
import { ResearchActionsBar } from "@/features/chat/components/research-actions";
import type { DocumentItem } from "@/shared/types/api";

interface ChatWindowProps {
  email: string | null;
  documents: DocumentItem[];
  sidebarOpen?: boolean;
}

export default function ChatWindow({ email, documents, sidebarOpen = true }: ChatWindowProps) {
  const { input, setInput, sendMessage, runAction, regenerate, cancelStreaming, retryLastMessage, isStreaming, activeSession, chatError, setSessionDocuments } = useChat();
  const [isDragging, setIsDragging] = useState(false);

  // ── In-chat search ──────────────────────────────────────────────────────
  // Distinct from both the top bar's tool search and the sidebar's
  // "search documents & chats" — this searches the *text of the currently
  // open conversation*. Owned here (the shared parent of ChatHeader, which
  // renders the search box, and ChatMessageList, which highlights/scrolls
  // to results) rather than in either child.
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [chatSearchActiveResult, setChatSearchActiveResult] = useState(0);

  const chatSearchMatches = useMemo(() => {
    const query = chatSearchQuery.trim().toLowerCase();
    if (!query) return [];
    return visibleChatMessages(activeSession?.messages ?? [])
      .map((message, index) => ({ index, message }))
      .filter(({ message }) => message.content.toLowerCase().includes(query));
  }, [activeSession?.messages, chatSearchQuery]);

  // Clamp instead of reset on every keystroke, so typing a narrower query
  // that still contains the current result keeps it selected.
  const activeResult = Math.min(chatSearchActiveResult, Math.max(0, chatSearchMatches.length - 1));

  const goToNextMatch = useCallback(() => {
    if (chatSearchMatches.length === 0) return;
    setChatSearchActiveResult((i) => (i + 1) % chatSearchMatches.length);
  }, [chatSearchMatches.length]);

  const goToPrevMatch = useCallback(() => {
    if (chatSearchMatches.length === 0) return;
    setChatSearchActiveResult((i) => (i - 1 + chatSearchMatches.length) % chatSearchMatches.length);
  }, [chatSearchMatches.length]);

  const closeChatSearch = useCallback(() => {
    setChatSearchOpen(false);
    setChatSearchQuery("");
    setChatSearchActiveResult(0);
  }, []);

  const handleChatSearchQueryChange = useCallback((value: string) => {
    setChatSearchQuery(value);
    setChatSearchActiveResult(0);
  }, []);

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
      className="relative flex h-full flex-col text-white"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ChatHeader
        sidebarOpen={sidebarOpen}
        documents={documents}
        selectedDocumentIds={activeSession?.document_ids ?? []}
        onChangeSelectedDocuments={setSessionDocuments}
        searchOpen={chatSearchOpen}
        onToggleSearch={() => (chatSearchOpen ? closeChatSearch() : setChatSearchOpen(true))}
        searchQuery={chatSearchQuery}
        onSearchQueryChange={handleChatSearchQueryChange}
        searchMatchCount={chatSearchMatches.length}
        searchActiveResult={activeResult}
        onSearchNext={goToNextMatch}
        onSearchPrev={goToPrevMatch}
        onSearchClose={closeChatSearch}
      />

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
        onRegenerate={regenerate}
        searchQuery={chatSearchQuery.trim()}
        activeMatchIndex={chatSearchMatches.length > 0 ? chatSearchMatches[activeResult]?.index ?? null : null}
        sessionKey={activeSession.id}
      />
      <ResearchActionsBar
        selectedCount={(activeSession.document_ids ?? []).length}
        documentsAvailable={documents.length}
        disabled={isStreaming}
        onRun={runAction}
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
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-2)]">
            <svg className="h-9 w-9 text-[var(--text-primary)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-[16px] font-medium text-[var(--text-primary)] opacity-70">Drop PDF to upload</p>
            <p className="mt-1 text-[13px] text-[var(--text-primary)] opacity-40">Release to add it to your documents</p>
          </div>
        </div>
      )}
    </div>
  );
}
