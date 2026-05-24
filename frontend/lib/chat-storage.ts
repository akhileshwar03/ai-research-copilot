import { sessionsApi } from "@/services/api/sessions-api";
import type { ChatSession } from "@/shared/types/chat";

export async function fetchSessions(): Promise<ChatSession[]> {
  try {
    return await sessionsApi.list();
  } catch {
    return [];
  }
}

export async function createSession(session: ChatSession) {
  await sessionsApi.create({ session });
}

export async function updateSession(session: ChatSession) {
  await sessionsApi.update(session.id, { session });
}

export async function deleteSession(sessionId: number) {
  await sessionsApi.remove(sessionId);
}
