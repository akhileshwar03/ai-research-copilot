import { PRODUCTS } from "@/features/landing/products";

/**
 * Homepage hero copy, kept as data so it can be tested. Every line must be true of the tool it names:
 * these are the same capabilities the tool pages and the app itself describe.
 */

/** Two short capability chips floated beside each tool's live preview. */
export const HERO_CHIPS: Record<string, [string, string]> = {
  "Research Copilot": ["Streams in real time", "Page-level citations"],
  Humanizer: ["Word-level diff", "Streams live"],
  "AI Checker": ["Sentence-level highlights", "States its own confidence"],
  "Real-time AI": ["Live web search", "Clickable, numbered sources"],
  "Paper Analyzer": ["Measured from the PDF", "APA · MLA · IEEE"],
};

/** "Every tool shows its work": one verifiable fact per tool, in nav order. */
export const SHOWS_ITS_WORK: { tool: string; fact: string }[] = [
  { tool: "Research Copilot", fact: "Page-level citations, with a viewer that jumps to the page" },
  { tool: "Humanizer", fact: "A word-level diff of every change it makes" },
  { tool: "AI Checker", fact: "A confidence level, stated even when it is low" },
  { tool: "Real-time AI", fact: "Numbered, clickable sources for every answer" },
  { tool: "Paper Analyzer", fact: "Margins, spacing and fonts measured from the PDF" },
];

export const HERO_SUBHEAD =
  "Ask your documents, rewrite AI-sounding text, detect AI-written content, search the live web and check a paper's formatting. Every tool shows its work: citations you can open, confidence it admits to, changes you can see.";

export const PRODUCT_NAMES = PRODUCTS.map((p) => p.name);
