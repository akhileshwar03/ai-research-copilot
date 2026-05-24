"use client";

import { useCallback, useRef, useState } from "react";

import { chatApi } from "@/services/api/chat-api";
import type { Message } from "@/shared/types/chat";

interface StreamArgs {
  messages: Message[];
  documentId?: string;
  onAssistantToken: (text: string, sources?: string) => void;
}

export function useStreamingChat() {
  const abortRef = useRef<AbortController | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const stream = useCallback(async ({ messages, documentId, onAssistantToken }: StreamArgs) => {
    cancel();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    try {
      const response = await chatApi.stream(
        {
          messages,
          document_id: documentId || undefined,
        },
        controller.signal
      );

      if (!response.ok || !response.body) {
        throw new Error("Unable to stream response");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedText = "";
      const sources = response.headers.get("X-Sources") || "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        streamedText += decoder.decode(value, { stream: true });
        onAssistantToken(streamedText, sources);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [cancel]);

  return {
    stream,
    cancel,
    isStreaming,
  };
}
