import { apiRequest } from "@/services/api/client";

export interface CheckSignals {
  burstiness: number;
  lexical_diversity: number;
  ai_phrase_hits: number;
  heuristic_score: number;
  llm_probability: number | null;
}

export interface ParagraphScore {
  text: string;
  ai_probability: number;
  verdict: "likely_human" | "uncertain" | "likely_ai";
}

export interface CheckResult {
  ai_probability: number;
  verdict: "likely_human" | "uncertain" | "likely_ai";
  confidence: "low" | "moderate";
  signals: CheckSignals;
  ai_sentences: string[];
  paragraphs: ParagraphScore[];
  explanation: string;
  disclaimer: string;
}

export interface FeedbackIssue {
  original: string;
  suggestion: string;
  type: "grammar" | "spelling" | "style" | "clarity" | "word-choice";
  explanation: string;
}

export interface WritingFeedbackResult {
  issues: FeedbackIssue[];
  overall_score: number;
  summary: string;
  word_count: number;
}

export const checkerApi = {
  checkText: (text: string, advanced = false) =>
    apiRequest<CheckResult>("/checker/text", {
      method: "POST",
      body: JSON.stringify({ text, advanced }),
    }),

  checkDocument: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest<CheckResult>("/checker/document", {
      method: "POST",
      body: formData,
    });
  },

  writingFeedback: (text: string) =>
    apiRequest<WritingFeedbackResult>("/checker/feedback", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
};
