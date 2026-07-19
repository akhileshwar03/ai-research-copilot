"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { DocumentsResponse, SessionsResponse } from "@/shared/types/api";
import type { Message } from "@/shared/types/chat";
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

export function useChat(email: string | null) {
  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState<string>("");
  const lastSentMessageRef = useRef<string>("");
  const updateMessages = useSessionStore((s) => s.updateMessages);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const queryClient = useQueryClient();

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

  const sendMessage = async () => {
    if (!activeSession || !input.trim()) {
      return;
    }
    setChatError("");

    const userMessage: Message = { role: "user", content: input.trim() };
    lastSentMessageRef.current = input.trim();
    const baselineMessages = [...activeSession.messages, userMessage];
    updateMessages(activeSession.id, baselineMessages);
    setInput("");

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
      await stream({
        messages: baselineMessages,
        documentIds: activeSession.document_ids ?? [],
        onAssistantToken: (text, sources) => {
          updateMessages(activeSession.id, [
            ...baselineMessages,
            { role: "assistant", content: text, sources: formatSources(sources) },
          ]);
        },
      });
    } catch (error) {
      updateMessages(activeSession.id, [
        ...baselineMessages,
        { role: "assistant", content: "Request failed. Please retry." },
      ]);
      setChatError(error instanceof Error ? error.message : "Request failed. Please retry.");
      return; // don't try to save a failed session
    }

    // Stream succeeded — persist the session. Failure here is non-fatal (show a toast, not an error banner).
    try {
      await updateMutation.mutateAsync(activeSession.id);
    } catch {
      toast.error("Session not saved — check your connection", { duration: 4000 });
    }
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

  /** Undo the last failed message: restore user input and strip the error turn. */
  const retryLastMessage = () => {
    if (!activeSession || !lastSentMessageRef.current) return;
    const msgs = [...activeSession.messages];
    // Remove the error assistant reply
    if (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
    // Remove the user message that failed
    if (msgs.length && msgs[msgs.length - 1].role === "user") msgs.pop();
    updateMessages(activeSession.id, msgs);
    setInput(lastSentMessageRef.current);
    setChatError("");
  };

  return {
    input,
    setInput,
    sendMessage,
    cancelStreaming: cancel,
    retryLastMessage,
    isStreaming,
    activeSession,
    chatError,
    setSessionDocuments,
  };
}
