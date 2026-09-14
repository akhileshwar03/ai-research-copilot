export type MessageRole = "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
  sources?: string;
  /** Follow-up questions suggested after this assistant reply (not persisted). */
  suggestions?: string[];
  /** The research action that produced this user turn, if any. */
  action?: ResearchAction;
}

export type ResearchAction = "summarize" | "key_findings" | "report" | "compare" | "references" | "questions";

export const RESEARCH_ACTIONS: { key: ResearchAction; label: string; hint: string; minDocs?: number }[] = [
  { key: "summarize", label: "Summarize", hint: "Structured summary with page citations" },
  { key: "key_findings", label: "Key findings", hint: "Numbered findings with evidence and pages" },
  { key: "report", label: "Research report", hint: "Full Markdown report: summary, findings, limitations, sources" },
  { key: "compare", label: "Compare", hint: "Side-by-side table, agreements, contradictions, gaps", minDocs: 2 },
  { key: "references", label: "References", hint: "Every citation in APA + BibTeX" },
  { key: "questions", label: "Study questions", hint: "10 questions with cited model answers" },
];

export interface ChatSession {
  id: number;
  title: string;
  pinned?: boolean;
  created_at?: string | null;
  messages: Message[];
  /** Document ids this session's chat retrieval is scoped to; empty = search all documents. */
  document_ids?: string[];
}
