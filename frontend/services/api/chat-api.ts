import { apiStream } from "@/services/api/client";
import type { ChatRequest } from "@/shared/types/api";

export const chatApi = {
  stream: (payload: ChatRequest, signal?: AbortSignal) => apiStream("/chat", payload, signal),
};
