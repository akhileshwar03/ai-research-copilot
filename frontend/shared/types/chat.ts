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
  /** Document ids this session's chat retrieval is scoped to; empty = search all documents. */
  document_ids?: string[];
}
