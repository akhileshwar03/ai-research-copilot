export type MessageRole = "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
  sources?: string;
}

export interface ChatSession {
  id: number;
  title: string;
  pinned?: boolean;
  created_at?: string | null;
  messages: Message[];
}
