import type { CheckResult, Level, Verdict } from "@/services/api/checker-api";

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
    detail: "The signals are mixed, so neither answer is safe to rely on.",
  },
  likely_ai: {
    tone: "ai",
    label: "Likely AI",
    headline: "This looks AI-written or AI-edited.",
    detail: "The sentences that stand out most are highlighted below.",
  },
};

/** The two clear levels the newer model adds on top of "Likely human" and "Likely AI". */
const STRONG_HUMAN: VerdictInfo = {
  tone: "human",
  label: "Human",
  headline: "This reads as human-written.",
  detail: "The checker found no sign of AI writing, and it is confident.",
};
const STRONG_AI: VerdictInfo = {
  tone: "ai",
  label: "AI",
  headline: "This reads as AI-written or AI-edited.",
  detail: "The checker is confident. The sentences that stand out most are highlighted below.",
};

/** Shown instead of "Likely AI" or "Unsure" when the model's top answer is a human + AI mix. The verdict itself means
 *  "not purely human", so without this a mostly-mixed text would read "Likely AI" or "Unsure" beside a bar that says
 *  Mixed. The model has no separate answer for rewritten or paraphrased text (that was trained in as AI), so this does
 *  not claim to detect it; it only says what a mix can mean. */
export const MIXED_VERDICT: VerdictInfo = {
  tone: "unsure",
  label: "Likely mixed",
  headline: "This looks like a mix of human and AI writing.",
  detail: "Some sentences read as human, some as AI-written, and the sentence map shows where. It can also mean AI text that a person has edited.",
};

/** The model's three-way split of a result: human, mixed, and AI-only shares of its estimate. */
export function splitOf(result: CheckResult) {
  const mixed = result.mixed_probability;
  return { human: 1 - result.ai_score, mixed, ai: Math.max(0, result.ai_score - mixed) };
}

/** What to show for a result: the verdict's wording, unless the model's top answer is a mix. */
/** Whole-number percentages of the three shares that always add up to exactly 100. Rounding each share on its own can
 *  give 101 or 99; this rounds down, then gives the leftover points to the largest remainders, so what is shown adds
 *  up and no share moves by more than one point. */
export function splitPercents(human: number, mixed: number, ai: number): [number, number, number] {
  const raw = [human, mixed, ai].map((v) => Math.max(0, v) * 100);
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  const scaled = raw.map((v) => (v / total) * 100);
  const floors = scaled.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  scaled
    .map((v, i) => ({ i, rest: v - Math.floor(v) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i)
    .forEach(({ i }) => {
      if (left > 0) {
        floors[i] += 1;
        left -= 1;
      }
    });
  return [floors[0], floors[1], floors[2]];
}

/** The one number shown beside the verdict: the model's own estimate for the side the verdict picked, taken from the
 *  same three-way split as the Human / Mixed / AI rows so the page never shows two different figures. It is null for
 *  "Unsure" and "Mixed", where the model is least reliable and a headline number would look more certain than it is.
 *  `position` places the needle on the Human-to-AI dial (0 to 1). */
/** The AI confidence is shown capped at this: a clearly AI text reads "95%+", never "100%". In our tests the model's raw
 *  "99% AI" was right about 79% of the time, and its percentages could not be calibrated well enough to show more. */
export const AI_DISPLAY_CAP = 95;

export function headlineOf(result: CheckResult): { percent: number | null; side: "Human" | "AI" | null; position: number; capped: boolean } {
  const position = Math.min(1, Math.max(0, result.ai_score));
  const level = result.level;
  const noNumber = level ? level === "unsure" || level === "mixed" : presentVerdict(result) === MIXED_VERDICT || result.verdict === "uncertain";
  if (noNumber) return { percent: null, side: null, position, capped: false };
  const { human, mixed, ai } = splitOf(result);
  const [humanPct, , aiPct] = splitPercents(human, mixed, ai);
  const humanSide = level ? level === "human" || level === "likely_human" : result.verdict === "likely_human";
  return humanSide
    ? { percent: humanPct, side: "Human", position, capped: false }
    : { percent: Math.min(aiPct, AI_DISPLAY_CAP), side: "AI", position, capped: aiPct >= AI_DISPLAY_CAP };
}

/** "Unsure" says which way the model leaned, and only suggests a longer sample when the text is short. A fixed
 *  "a longer sample often helps" read as wrong under a 15-sentence text whose every sentence was marked AI. */
function unsureInfo(result: CheckResult): VerdictInfo {
  const base = VERDICTS.uncertain;
  let { headline, detail } = base;
  if (result.ai_score >= LEANS_AI_FROM) {
    headline = "The checker leans towards AI, but not enough to say so.";
    detail = "Strong enough to look closer, not strong enough to call it. Check the highlighted sentences.";
  } else if (result.ai_score <= LEANS_HUMAN_UP_TO) {
    headline = "The checker leans towards human, but not enough to say so.";
    detail = "Nothing stands out strongly as AI, but it is not clearly human either.";
  }
  if (result.word_count < SHORT_TEXT_WORDS) detail += " A longer sample often helps.";
  return { ...base, headline, detail };
}

/** Below this many words, "a longer sample often helps" is fair advice. */
const SHORT_TEXT_WORDS = 200;
/** An "Unsure" whose overall score is at or above this leans AI; at or below the second, it leans human. */
const LEANS_AI_FROM = 0.85;
const LEANS_HUMAN_UP_TO = 0.5;

/** What to say for each level of the newer model. "Unsure" keeps its lean from the server; "Mixed" says what a mix can mean. */
function presentLevel(level: Level, result: CheckResult): VerdictInfo {
  switch (level) {
    case "human":
      return STRONG_HUMAN;
    case "likely_human":
      return VERDICTS.likely_human;
    case "likely_ai":
      return VERDICTS.likely_ai;
    case "ai":
      return STRONG_AI;
    case "mixed":
      return { ...MIXED_VERDICT, label: "Mixed" };
    default: {
      const base = VERDICTS.uncertain;
      // Only the AI lean is stated: the server's "human" lean covers scores where the model's own split already puts
      // more weight on AI than on human, so saying "leans towards human" would sit beside numbers that say the opposite.
      const headline = result.lean === "ai" ? "The checker leans towards AI, but not enough to say so." : base.headline;
      const detail =
        result.lean === "ai"
          ? "Strong enough to look closer, not strong enough to call it. Check the highlighted sentences."
          : "Nothing stands out strongly as AI, but it is not clearly human either.";
      return { ...base, headline, detail: result.word_count < SHORT_TEXT_WORDS ? `${detail} A longer sample often helps.` : detail };
    }
  }
}

export function presentVerdict(result: CheckResult): VerdictInfo {
  if (result.level) return presentLevel(result.level, result);
  const { human, mixed, ai } = splitOf(result);
  if (result.verdict !== "likely_human" && mixed > ai && mixed > human) return MIXED_VERDICT;
  if (result.verdict === "uncertain") return unsureInfo(result);
  return VERDICTS[result.verdict];
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

/** Counts sentences the way the checker's server does (it splits after . ! ? and at line breaks, and ignores
 *  fragments with fewer than two letters). The server refuses fewer than three, so this lets us say so up front. */
export function countSentences(text: string): number {
  return text.split(/(?<=[.!?])["')\]]*\s+|\n+/).filter((part) => (part.match(/[A-Za-z]/g)?.length ?? 0) >= 2).length;
}
