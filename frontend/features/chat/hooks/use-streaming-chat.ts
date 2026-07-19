"use client";

import { useCallback, useRef, useState } from "react";

import { chatApi } from "@/services/api/chat-api";
import type { Message } from "@/shared/types/chat";

interface StreamArgs {
  messages: Message[];
  documentIds?: string[];
  onAssistantToken: (text: string, sources?: string[]) => void;
}

/**
 * Parse a Server-Sent Events stream into discrete text tokens.
 *
 * The backend sends events in the form:
 *   data: <json-encoded-token>\n\n
 *   event: done\ndata: \n\n
 *   event: error\ndata: {"message":"..."}\n\n
 *
 * A buffer accumulates incomplete SSE frames across chunk boundaries so
 * we never try to JSON-parse a partially-received line.
 */
async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<
  | { type: "token"; value: string }
  | { type: "sources"; value: string[] }
  | { type: "done" }
  | { type: "error"; message: string }
> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        yield { type: "done" };
        return;
      }

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are delimited by \n\n
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const lines = frame.split("\n");
        let data = "";
        currentEvent = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            data = line.slice(6);
          }
        }

        if (currentEvent === "done") {
          yield { type: "done" };
          return;
        }

        if (currentEvent === "error") {
          try {
            const parsed = JSON.parse(data) as { message?: string };
            yield { type: "error", message: parsed.message ?? "Stream error" };
          } catch {
            yield { type: "error", message: "Stream error" };
          }
          return;
        }

        if (currentEvent === "sources") {
          try {
            const parsed = JSON.parse(data) as string[];
            if (Array.isArray(parsed)) {
              yield { type: "sources", value: parsed };
            }
          } catch {
            // Malformed sources frame — citations are cosmetic, keep streaming.
          }
          continue;
        }

        if (data) {
          try {
            const token = JSON.parse(data) as string;
            yield { type: "token", value: token };
          } catch {
            // Malformed frame — skip silently rather than crashing the stream.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function useStreamingChat() {
  const abortRef = useRef<AbortController | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const stream = useCallback(
    async ({ messages, documentIds, onAssistantToken }: StreamArgs) => {
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      try {
        const response = await chatApi.stream(
          { messages, document_ids: documentIds && documentIds.length > 0 ? documentIds : undefined },
          controller.signal,
        );

        if (!response.ok || !response.body) {
          throw new Error("Unable to connect to stream");
        }

        let sources: string[] = [];
        let streamedText = "";

        for await (const event of parseSseStream(response.body)) {
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
