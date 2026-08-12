import { apiRequest, apiStream } from "@/services/api/client";

export type HumanizeStyle = "normal" | "clear_structured" | "simple_formal";

export interface HumanizeRun {
  id: number;
  input_text: string;
  output_text: string;
  style: HumanizeStyle;
  created_at: string;
}

export interface HumanizeRunListResponse {
  runs: HumanizeRun[];
  total: number;
  skip: number;
  limit: number;
}

export const humanizerApi = {
  stream: (text: string, style: HumanizeStyle, expand: boolean, signal?: AbortSignal) =>
    apiStream("/humanize", { text, style, expand }, signal),

  // "Ultra Human" — the real fine-tuned model, not GPT. Local-Ollama-only right
  // now (no production hosting yet); a real 503/504 from the backend means
  // it's genuinely unreachable in this environment, not a bug — thrown as a
  // normal Error via apiRequest's existing error handling, caught by the caller.
  ultra: (text: string, style: HumanizeStyle, expand: boolean) =>
    apiRequest<{ text: string }>("/humanize/ultra", {
      method: "POST",
      body: JSON.stringify({ text, style, expand }),
    }),

  listRuns: (skip = 0, limit = 50) =>
    apiRequest<HumanizeRunListResponse>(`/humanizer/runs?skip=${skip}&limit=${limit}`),

  saveRun: (inputText: string, outputText: string, style: HumanizeStyle) =>
    apiRequest<{ id: number }>("/humanizer/runs", {
      method: "POST",
      body: JSON.stringify({ input_text: inputText, output_text: outputText, style }),
    }),

  deleteRun: (runId: number) =>
    apiRequest<{ id: number }>(`/humanizer/runs/${runId}`, {
      method: "DELETE",
    }),

  deleteAllRuns: () =>
    apiRequest<{ deleted: number }>("/humanizer/runs/all", {
      method: "DELETE",
    }),
};
