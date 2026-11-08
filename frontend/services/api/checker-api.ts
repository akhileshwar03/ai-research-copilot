import { apiRequest } from "@/services/api/client";

export type Verdict = "likely_human" | "uncertain" | "likely_ai";

export interface SentenceScore {
  text: string;
  ai_score: number | null;
  flagged: boolean;
}

export interface CheckResult {
  verdict: Verdict;
  /** Probability the model puts on "not purely human" (AI-written, AI-edited or mixed), 0-1. */
  ai_score: number;
  /** The model's probability for a human + AI mix, 0-1. */
  mixed_probability: number;
  word_count: number;
  sentences: SentenceScore[];
  disclaimer: string;
}

export const checkerApi = {
  checkText: (text: string) =>
    apiRequest<CheckResult>("/checker/text", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  checkDocument: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest<CheckResult>("/checker/document", {
      method: "POST",
      body: formData,
    });
  },
};
