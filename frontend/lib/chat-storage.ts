import { Message } from "@/types/chat";

export type ChatSession = {
  id: number;
  title: string;
  messages: Message[];
};

const STORAGE_KEY = "ai-research-copilot";

export function saveSessions(
  sessions: ChatSession[]
) {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(sessions)
  );
}

export function loadSessions():
  ChatSession[] {

  const stored =
    localStorage.getItem(STORAGE_KEY);

  if (!stored) return [];

  return JSON.parse(stored);
}