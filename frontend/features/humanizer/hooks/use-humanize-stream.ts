"use client";

import { useCallback, useRef, useState } from "react";

import { parseSseStream } from "@/features/chat/hooks/use-streaming-chat";
import { humanizerApi, type HumanizeStyle } from "@/services/api/humanizer-api";

interface StreamArgs {
  text: string;
  style: HumanizeStyle;
  expand?: boolean;
  onToken: (accumulatedText: string) => void;
}

export function useHumanizeStream() {
  const abortRef = useRef<AbortController | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const stream = useCallback(
    async ({ text, style, expand, onToken }: StreamArgs): Promise<string> => {
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      try {
        const response = await humanizerApi.stream(text, style, expand ?? false, controller.signal);
        if (!response.ok || !response.body) {
          throw new Error("Unable to connect to stream");
        }

        let accumulated = "";
        for await (const event of parseSseStream(response.body)) {
          if (controller.signal.aborted) break;

          if (event.type === "token") {
            accumulated += event.value;
            onToken(accumulated);
          } else if (event.type === "revised") {
            // Pass 3 patched a paragraph after the token stream finished —
            // swap in the corrected full text before the run is marked done.
            accumulated = event.value;
            onToken(accumulated);
          } else if (event.type === "error") {
            throw new Error(event.message);
          } else if (event.type === "done") {
            break;
          }
        }
        return accumulated;
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [cancel],
  );

  return { stream, cancel, isStreaming };
}
