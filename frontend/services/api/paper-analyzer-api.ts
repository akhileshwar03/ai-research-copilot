import { apiRequest } from "@/services/api/client";

export type StyleGuide = "apa" | "mla" | "ieee";

export type CheckStatus = "pass" | "warning" | "fail";

export interface FormattingCheck {
  id: string;
  label: string;
  status: CheckStatus;
  score: number;
  measured: string;
  expected: string;
  explanation: string;
}

export interface PaperAnalysisResult {
  style_guide: string;
  overall_score: number;
  page_count: number;
  checks: FormattingCheck[];
  disclaimer: string;
}

export const paperAnalyzerApi = {
  analyze: (file: File, style: StyleGuide) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("style", style);
    return apiRequest<PaperAnalysisResult>("/paper-analyzer/analyze", {
      method: "POST",
      body: formData,
    });
  },
};
