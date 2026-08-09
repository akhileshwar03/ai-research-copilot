"use client";

import { useCallback, useRef, useState } from "react";

import { parseSseStream } from "@/features/chat/hooks/use-streaming-chat";
import { realtimeApi, type RealtimeMessage } from "@/services/api/realtime-api";

export interface RealtimeSource {
  title: string;
  url: string;
}

interface StreamArgs {
  messages: RealtimeMessage[];
  onAssistantToken: (text: string, sources: RealtimeSource[]) => void;
}

export function useRealtimeStream() {
  const abortRef = useRef<AbortController | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const stream = useCallback(
    async ({ messages, onAssistantToken }: StreamArgs) => {
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      try {
        const response = await realtimeApi.stream(messages, controller.signal);
        if (!response.ok || !response.body) {
          throw new Error("Unable to connect to stream");
        }

        let sources: RealtimeSource[] = [];
        let streamedText = "";

        for await (const event of parseSseStream<RealtimeSource[]>(response.body)) {
          if (controller.signal.aborted) break;

          if (event.type === "sources") {
            sources = event.value;
          } else if (event.type === "token") {
            streamedText += event.value;
            onAssistantToken(streamedText, sources);
          } else if (event.type === "error") {
            throw new Error(event.message);
          } else {
            break;
          }
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [cancel],
  );

  return { stream, cancel, isStreaming };
}
