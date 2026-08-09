import { apiRequest, apiStream } from "@/services/api/client";

export interface RealtimeMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { title: string; url: string }[];
}

export interface RealtimeSessionSummary {
  id: number;
  title: string | null;
  pinned: boolean;
  created_at: string | null;
  messages: RealtimeMessage[];
}

export interface RealtimeSessionsResponse {
  sessions: RealtimeSessionSummary[];
  total: number;
  skip: number;
  limit: number;
  retention_days: number;
}

export interface RealtimeSessionPayload {
  id: number;
  title: string;
  pinned: boolean;
  messages: RealtimeMessage[];
}

export const realtimeApi = {
  stream: (messages: RealtimeMessage[], signal?: AbortSignal) =>
    apiStream("/realtime/chat", { messages: messages.map((m) => ({ role: m.role, content: m.content })) }, signal),

  listSessions: () => apiRequest<RealtimeSessionsResponse>("/realtime/sessions"),

  createSession: (session: RealtimeSessionPayload) =>
    apiRequest<{ id: number }>("/realtime/sessions", {
      method: "POST",
      body: JSON.stringify({ session }),
    }),

  updateSession: (session: RealtimeSessionPayload) =>
    apiRequest<{ message: string }>(`/realtime/sessions/${session.id}`, {
      method: "PUT",
      body: JSON.stringify({ session }),
    }),

  deleteSession: (id: number) =>
    apiRequest<{ message: string }>(`/realtime/sessions/${id}`, {
      method: "DELETE",
    }),
};
