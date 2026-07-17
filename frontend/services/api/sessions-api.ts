import { apiRequest } from "@/services/api/client";
import type { ChatSession } from "@/shared/types/chat";
import type { SessionCreateResponse, SessionPayload, SessionsResponse } from "@/shared/types/api";

export const sessionsApi = {
  list: (skip = 0, limit = 200) =>
    apiRequest<SessionsResponse>(`/sessions?skip=${skip}&limit=${limit}`),

  create: (payload: SessionPayload) =>
    apiRequest<SessionCreateResponse>("/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (sessionId: number, payload: SessionPayload) =>
    apiRequest<{ message: string }>(`/sessions/${sessionId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  remove: (sessionId: number) =>
    apiRequest<{ message: string }>(`/sessions/${sessionId}`, {
      method: "DELETE",
    }),
};
