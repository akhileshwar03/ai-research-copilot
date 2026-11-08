import type { CheckResult, Verdict } from "@/services/api/checker-api";

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

/** Shown instead of "Likely AI" when the model's top answer is a human + AI mix. The verdict itself means "not
 *  purely human", so without this a mostly-mixed text would read "Likely AI" beside a bar that says Mixed. */
export const MIXED_VERDICT: VerdictInfo = {
  tone: "unsure",
  label: "Likely mixed",
  headline: "This looks like a mix of human and AI writing.",
  detail: "Some sentences read as human, some as AI-written. The sentence map shows where.",
};

/** The model's three-way split of a result: human, mixed, and AI-only shares of its estimate. */
export function splitOf(result: CheckResult) {
  const mixed = result.mixed_probability;
  return { human: 1 - result.ai_score, mixed, ai: Math.max(0, result.ai_score - mixed) };
}

/** What to show for a result: the verdict's wording, unless the model's top answer is a mix. */
export function presentVerdict(result: CheckResult): VerdictInfo {
  const { mixed, ai } = splitOf(result);
  return result.verdict === "likely_ai" && mixed > ai ? MIXED_VERDICT : VERDICTS[result.verdict];
}

/** The three colours a sentence can get. The sentence model only separates human-origin from AI-origin text, so
 *  there is no per-sentence "mixed": the in-between band is "unsure". */
export const SENTENCE_LABELS: Record<Tone, { name: string; meaning: string }> = {
  human: { name: "Human", meaning: "reads as human-written" },
  unsure: { name: "Unsure", meaning: "the model can't tell" },
  ai: { name: "AI", meaning: "reads as AI-written or AI-edited" },
};

/** CSS custom properties for a tone (defined in app/globals.css, with light and dark values). */
export const TONE_COLOR: Record<Tone, { text: string; soft: string; fill: string }> = {
  human: { text: "var(--verdict-human)", soft: "var(--verdict-human-soft)", fill: "var(--verdict-human-fill)" },
  unsure: { text: "var(--verdict-unsure)", soft: "var(--verdict-unsure-soft)", fill: "var(--verdict-unsure-fill)" },
  ai: { text: "var(--verdict-ai)", soft: "var(--verdict-ai-soft)", fill: "var(--verdict-ai-fill)" },
};

/** Cuts text to at most `max` characters, ending at the last full sentence when there is one. */
export function trimToLimit(text: string, max: number): string {
  const cut = text.slice(0, max);
  const lastSentence = cut.match(/[\s\S]*[.!?]["')\]]?(?=\s|$)/);
  return (lastSentence ? lastSentence[0] : cut).trim();
}

/** A file size people can read: KB below one megabyte, MB above. */
export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Counts words the same way the backend does, so the minimum shown here matches the one enforced there. */
export function countWords(text: string): number {
  return text.match(/[A-Za-z0-9']+/g)?.length ?? 0;
}
