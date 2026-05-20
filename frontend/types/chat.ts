export type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: string;
};

export type ChatSession = {
  id: number;
  title: string;
  messages: Message[];
  pinned?: boolean;
};