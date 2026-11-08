import type { Verdict } from "@/services/api/checker-api";

export type Tone = "human" | "unsure" | "ai";

export interface VerdictInfo {
  tone: Tone;
  /** Short label shown on the badge. */
  label: string;
  headline: string;
  /** One or two plain sentences on what the verdict means and how far to trust it. */
  detail: string;
}

export const VERDICTS: Record<Verdict, VerdictInfo> = {
  likely_human: {
    tone: "human",
    label: "Likely human",
    headline: "This looks human-written.",
    detail: "The checker found no strong signs of AI writing.",
  },
  uncertain: {
    tone: "unsure",
    label: "Unsure",
    headline: "The checker can't decide.",
    detail: "The signals are mixed, so neither answer is safe to rely on. A longer sample often helps.",
  },
  likely_ai: {
    tone: "ai",
    label: "Likely AI",
    headline: "This looks AI-written or AI-edited.",
    detail: "The sentences that stand out most are highlighted below.",
  },
};

/** CSS custom properties for a tone (defined in app/globals.css, with light and dark values). */
export const TONE_COLOR: Record<Tone, { text: string; soft: string }> = {
  human: { text: "var(--verdict-human)", soft: "var(--verdict-human-soft)" },
  unsure: { text: "var(--verdict-unsure)", soft: "var(--verdict-unsure-soft)" },
  ai: { text: "var(--verdict-ai)", soft: "var(--verdict-ai-soft)" },
};

/** Counts words the same way the backend does, so the minimum shown here matches the one enforced there. */
export function countWords(text: string): number {
  return text.match(/[A-Za-z0-9']+/g)?.length ?? 0;
}
