import { ChatSession } from "@/types/chat";

const STORAGE_KEY =
  "ai-research-copilot";

export function saveSessions(
  sessions: ChatSession[]
) {

  if (
    typeof window === "undefined"
  ) {
    return;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(sessions)
  );
}

export function loadSessions():
  ChatSession[] {

  if (
    typeof window === "undefined"
  ) {
    return [];
  }

  const stored =
    localStorage.getItem(
      STORAGE_KEY
    );

  if (!stored) {
    return [];
  }

  try {

    return JSON.parse(stored);

  } catch {

    return [];
  }
}