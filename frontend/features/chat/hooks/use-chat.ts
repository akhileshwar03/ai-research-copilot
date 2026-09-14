"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { DocumentsResponse, SessionsResponse } from "@/shared/types/api";
import type { Message, ResearchAction } from "@/shared/types/chat";
import { RESEARCH_ACTIONS } from "@/shared/types/chat";
import { useSessionStore } from "@/stores/session-store";
import { sessionsApi } from "@/services/api/sessions-api";

import { useStreamingChat } from "@/features/chat/hooks/use-streaming-chat";

/** Derive a session title from the first user message — instant, no API call needed. */
function deriveTitle(message: string): string {
  const cleaned = message.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 52) return cleaned;
  // Break at word boundary
  const truncated = cleaned.slice(0, 52);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

export function useChat() {
  const [input, setInput] = useState("");
  // Both keyed by session id rather than being one bare/shared value. An
  // error banner (and the retry state behind it) belongs to the session it
  // happened in — with a single shared value, switching sessions after a
  // failed send left the previous session's error banner (and a retry that
  // would pop messages off / refill the input of) showing on top of the
  // newly active, completely unrelated session. Keying by id means there's
  // nothing to reset on session switch: reading the current session's entry
  // (defaulting to "none") is automatically correct, no effect required.
  const [chatErrorsBySession, setChatErrorsBySession] = useState<Record<number, string>>({});
  const [pendingBySession, setPendingBySession] = useState<Record<number, string>>({});
  const updateMessages = useSessionStore((s) => s.updateMessages);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const queryClient = useQueryClient();

  const chatError = activeSessionId != null ? chatErrorsBySession[activeSessionId] ?? "" : "";

  const setChatError = (sessionId: number, message: string) => {
    setChatErrorsBySession((prev) => {
      if (!message) {
        if (!(sessionId in prev)) return prev;
        const rest = { ...prev };
        delete rest[sessionId];
        return rest;
      }
      return { ...prev, [sessionId]: message };
    });
  };

  /** Map stored document IDs (UUIDs) from the stream to display names. */
  const formatSources = (sourceIds?: string[]): string | undefined => {
    if (!sourceIds || sourceIds.length === 0) return undefined;
    const docs = queryClient.getQueryData<DocumentsResponse>(["documents"])?.documents ?? [];
    const names = sourceIds.map((id) => docs.find((d) => d.id === id)?.name ?? id);
    // No "Sources:" prefix — the citation chip's icon carries that meaning.
    return names.join(", ");
  };

  const setSessions = useSessionStore((s) => s.setSessions);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);

  const updateMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId);
      if (!session) return;

      // Cancel any in-flight ["sessions"] fetch first. Without this, a
      // slower/older request (e.g. one queued by a create() elsewhere)
      // could resolve *after* our write below and silently clobber it with
      // stale (pre-message) data — this is exactly how a just-created
      // session used to go blank after a save.
      await queryClient.cancelQueries({ queryKey: ["sessions"] });

      let persisted = session;
      try {
        await sessionsApi.update(sessionId, { session });
      } catch {
        // The session shown to a brand-new account (before it's ever been
        // renamed or messaged) is a local-only placeholder that was never
        // POSTed to the backend — update() 404s. Create it now instead and
        // remap the local id to the real one.
        const created = await sessionsApi.create({ session });
        persisted = { ...session, id: created.id };
        const { sessions: latest, activeSessionId: activeId } = useSessionStore.getState();
        setSessions(latest.map((s) => (s.id === sessionId ? persisted : s)));
        if (activeId === sessionId) setActiveSessionId(created.id);
      }

      // Keep the query cache in lockstep with Zustand so no later refetch
      // (of a stale, still-live request) can ever present older data as new.
      queryClient.setQueryData<SessionsResponse>(["sessions"], (old) => {
        if (!old) return old;
        const withoutStale = old.sessions.filter((s) => s.id !== sessionId && s.id !== persisted.id);
        return { ...old, sessions: [persisted, ...withoutStale] };
      });
    },
  });

  const { stream, cancel, isStreaming } = useStreamingChat();

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  /**
   * Send a turn. With no arguments it sends the typed input; `runAction`
   * and `regenerate` below reuse it with an explicit message list so all
   * three entry points share one streaming/persistence path.
   */
  const sendMessage = async (options: { text?: string; action?: ResearchAction; history?: Message[] } = {}) => {
    const text = (options.text ?? input).trim();
    if (!activeSession || !text) {
      return;
    }
    const sessionId = activeSession.id;
    setChatError(sessionId, "");

    const userMessage: Message = { role: "user", content: text, ...(options.action ? { action: options.action } : {}) };
    setPendingBySession((prev) => ({ ...prev, [sessionId]: text }));
    const history = options.history ?? activeSession.messages;
    const baselineMessages = [...history, userMessage];
    updateMessages(activeSession.id, baselineMessages);
    if (options.text === undefined) setInput("");

    // Auto-title on first real user message (session still has default "New Chat" title)
    const isFirstMessage = activeSession.messages.filter((m) => m.role === "user").length === 0;
    if (isFirstMessage && activeSession.title === "New Chat") {
      const newTitle = deriveTitle(userMessage.content);
      const { sessions } = useSessionStore.getState();
      const updatedSessions = sessions.map((s) =>
        s.id === activeSession.id ? { ...s, title: newTitle } : s
      );
      setSessions(updatedSessions);
      // Persist the new title in background WITHOUT sending the current messages —
      // the full session (with assistant reply) is saved after streaming completes.
      // Sending messages here would race against that final save and could overwrite it.
      sessionsApi.update(activeSession.id, {
        session: { ...activeSession, title: newTitle, messages: [] },
      }).catch(() => {/* silently ignore */});
    }

    try {
      let streamed = "";
      let streamedSources: string | undefined;
      await stream({
        messages: baselineMessages,
        documentIds: activeSession.document_ids ?? [],
        action: options.action,
        onAssistantToken: (text, sources) => {
          streamed = text;
          streamedSources = formatSources(sources);
          updateMessages(activeSession.id, [
            ...baselineMessages,
            { role: "assistant", content: text, sources: streamedSources },
          ]);
        },
        onSuggestions: (suggestions) => {
          updateMessages(activeSession.id, [
            ...baselineMessages,
            { role: "assistant", content: streamed, sources: streamedSources, suggestions },
          ]);
        },
      });
    } catch (error) {
      updateMessages(activeSession.id, [
        ...baselineMessages,
        { role: "assistant", content: "Request failed. Please retry." },
      ]);
      setChatError(sessionId, error instanceof Error ? error.message : "Request failed. Please retry.");
      return; // don't try to save a failed session
    }

    // Stream succeeded — persist the session. Failure here is non-fatal (show a toast, not an error banner).
    try {
      await updateMutation.mutateAsync(activeSession.id);
    } catch {
      toast.error("Session not saved — check your connection", { duration: 4000 });
    }
  };

  /** One-click research task over the session's selected documents. The
   *  visible user turn is a short label; the backend swaps in the real,
   *  citation-demanding instruction (see RESEARCH_ACTIONS in chat_service.py). */
  const runAction = async (action: ResearchAction) => {
    if (!activeSession) return;
    if (!(activeSession.document_ids ?? []).length) {
      toast.error("Select at least one document (Sources, top right) to run a research action.");
      return;
    }
    const label = RESEARCH_ACTIONS.find((a) => a.key === action)?.label ?? action;
    await sendMessage({ text: label, action });
  };

  /** Re-ask the last user question, replacing the last assistant reply. */
  const regenerate = async () => {
    if (!activeSession || isStreaming) return;
    const msgs = activeSession.messages;
    const lastUserIndex = [...msgs].map((m) => m.role).lastIndexOf("user");
    if (lastUserIndex === -1) return;
    const lastUser = msgs[lastUserIndex];
    await sendMessage({ text: lastUser.content, action: lastUser.action, history: msgs.slice(0, lastUserIndex) });
  };

  /** Change which documents this session's retrieval is scoped to — persisted
   *  per-session, independent of any other session's selection. */
  const setSessionDocuments = async (documentIds: string[]) => {
    if (!activeSession) return;
    const { sessions: current } = useSessionStore.getState();
    setSessions(current.map((s) => (s.id === activeSession.id ? { ...s, document_ids: documentIds } : s)));
    try {
      await updateMutation.mutateAsync(activeSession.id);
    } catch {
      toast.error("Could not save document selection", { duration: 4000 });
    }
  };

  /** Undo the last failed message: restore user input and strip the error turn.
   *  Scoped to the active session's own pending entry — retrying can only
   *  ever act on the session it actually belongs to, since a different
   *  session simply has no entry (or its own) to read here. */
  const retryLastMessage = () => {
    if (!activeSession) return;
    const pendingText = pendingBySession[activeSession.id];
    if (!pendingText) return;
    const msgs = [...activeSession.messages];
    // Remove the error assistant reply
    if (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
    // Remove the user message that failed
    if (msgs.length && msgs[msgs.length - 1].role === "user") msgs.pop();
    updateMessages(activeSession.id, msgs);
    setInput(pendingText);
    setChatError(activeSession.id, "");
  };

  return {
    input,
    setInput,
    sendMessage: () => sendMessage(),
    runAction,
    regenerate,
    cancelStreaming: cancel,
    retryLastMessage,
    isStreaming,
    activeSession,
    chatError,
    setSessionDocuments,
  };
}
