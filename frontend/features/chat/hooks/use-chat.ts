"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import type { Message } from "@/shared/types/chat";
import { useSessionStore } from "@/stores/session-store";
import { sessionsApi } from "@/services/api/sessions-api";

import { useStreamingChat } from "@/features/chat/hooks/use-streaming-chat";

export function useChat(email: string | null, selectedDocument: string) {
  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState<string>("");
  const updateMessages = useSessionStore((s) => s.updateMessages);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const updateMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId);
      if (!session) {
        return;
      }
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
