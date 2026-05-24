"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

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

export function useChat(email: string | null, selectedDocument: string) {
  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState<string>("");
  const updateMessages = useSessionStore((s) => s.updateMessages);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const setSessions = useSessionStore((s) => s.setSessions);

  const updateMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId);
      if (!session) return;
      await sessionsApi.update(sessionId, { session });
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
      // Persist in background — don't await, don't block the stream
      sessionsApi.update(activeSession.id, {
        session: { ...activeSession, title: newTitle, messages: baselineMessages },
      }).catch(() => {/* silently ignore — title will revert on next load at worst */});
    }

    const optimisticAssistant: Message = { role: "assistant", content: "" };
    updateMessages(activeSession.id, [...baselineMessages, optimisticAssistant]);

    try {
      await stream({
        messages: baselineMessages,
        documentId: selectedDocument,
        onAssistantToken: (text, sources) => {
          updateMessages(activeSession.id, [...baselineMessages, { role: "assistant", content: text, sources }]);
        },
      });
      await updateMutation.mutateAsync(activeSession.id);
    } catch (error) {
      updateMessages(activeSession.id, [
        ...baselineMessages,
        { role: "assistant", content: "Request failed. Please retry." },
      ]);
      setChatError(error instanceof Error ? error.message : "Request failed. Please retry.");
    }
  };

  return {
    input,
    setInput,
    sendMessage,
    cancelStreaming: cancel,
    isStreaming,
    activeSession,
    chatError,
  };
}
