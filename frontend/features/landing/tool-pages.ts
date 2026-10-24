/**
 * Public, crawlable copy for the login-gated tool pages. A signed-out visitor (and Googlebot) used to be
 * redirected to /login and saw nothing; these pages now show this instead. Keep it factual: every claim
 * must match what the tool really does, and the examples are real runs of the live tools.
 */

export type ToolSlug = "chat" | "humanizer" | "checker";

export interface ToolPageContent {
  slug: ToolSlug;
  path: string;
  /** Must equal a PRODUCTS[].name: it picks the accent colour and the live demo. */
  name: string;
  /** The single <h1>, shown in two parts so the second can be set in the italic accent style. */
  h1: string;
  headline: { lead: string; emphasis: string };
  /** Two short, true capability chips floated beside the live preview. */
  chips: [string, string];
  intro: string;
  features: { title: string; body: string; bullets: string[] };
  cta: { title: string; body: string };
  steps: { title: string; body: string }[];
  example: {
    label: string;
    items: { heading: string; body: string }[];
    note: string;
  };
  goodToKnow: string[];
  faq: { q: string; a: string }[];
}

export const TOOL_PAGES: Record<ToolSlug, ToolPageContent> = {
  chat: {
    slug: "chat",
    path: "/chat",
    name: "Research Copilot",
    h1: "Chat with your PDFs and get answers you can verify.",
    headline: { lead: "Chat with your PDFs", emphasis: "and get answers you can verify." },
    chips: ["Streams in real time", "Page-level citations"],
    features: {
      title: "Every answer, traceable to a page.",
      body: "Upload, ask, and every answer streams back with a page citation you can check. Choose exactly which documents a chat can read, or work across several at once.",
      bullets: [
        "Answers grounded in the documents you select",
        "Page-level citations, with a built-in viewer that jumps to the page",
        "One-click actions: Summarize, Key findings, Research report, Compare, References, Study questions",
        "Streams live, token by token",
      ],
    },
    cta: { title: "Stop guessing. Start verifying.", body: "Upload a PDF and ask your first question. You can have a cited answer in under a minute." },
    intro:
      "Upload research papers, reports or any PDF, then ask questions in plain language. Research Copilot retrieves the relevant passages and answers with page-level citations, so you can check every claim against the source.",
    steps: [
      { title: "Upload a PDF", body: "Add one or more documents. They are read, split into passages and indexed for search." },
      { title: "Ask a question", body: "Ask about a fact, a method or a result, or use a one-click action such as Summarize, Key findings, Compare or References." },
      { title: "Check the citation", body: "Each answer names the page it came from, and the built-in viewer jumps to that page." },
    ],
    example: {
      label: "Example, from a sample clinical-trial document",
      items: [
        { heading: "Question", body: "How many patients were enrolled and how many had adverse events?" },
        {
          heading: "Answer",
          body: "The study enrolled 120 patients, and adverse events were reported in 8 patients (mostly mild headache) (page 1).",
        },
      ],
      note: "If a document does not contain the answer, the assistant says so instead of guessing.",
    },
    goodToKnow: [
      "You choose which documents a chat can read. With none selected, it answers as a general assistant and does not read your documents.",
      "Uploaded documents are deleted automatically after a retention period.",
      "AI can make mistakes. Use the page citations to verify anything important.",
    ],
    faq: [
      {
        q: "Does it only answer from my document?",
        a: "When documents are selected, answers are grounded in them and cite the page. If the passage is not there, it says so.",
      },
      {
        q: "Can I ask about several PDFs at once?",
        a: "Yes. Select multiple sources for a chat and use actions such as Compare to work across them.",
      },
      {
        q: "Is it free?",
        a: "You can sign in and use it on the free plan. Usage limits apply and are shown in the app.",
      },
    ],
  },

  humanizer: {
    slug: "humanizer",
    path: "/humanizer",
    name: "Humanizer",
    h1: "Rewrite AI-sounding text so it reads naturally.",
    headline: { lead: "Rewrite AI-sounding text", emphasis: "so it reads naturally." },
    chips: ["Word-level diff", "Streams live"],
    features: {
      title: "Sound human. Stay accurate.",
      body: "Rewrite AI-sounding text so it reads naturally, with meaning and facts preserved. Built to make writing genuinely better, not to trick a detector: no invisible characters, no gimmicks, just better editing.",
      bullets: [
        "Natural, direct rewrites, built for blog posts, social copy and product writing",
        "Word-diff transparency: see exactly which words changed",
        "Streams live, token by token, with no waiting for the full rewrite",
      ],
    },
    cta: { title: "Make it read like you wrote it.", body: "Paste a paragraph and see the rewrite, and every change, in seconds." },
    intro:
      "Paste text that sounds stiff or machine-written and get a rewrite with more natural phrasing and rhythm. A diff view shows exactly what changed, so you stay in control of the final wording.",
    steps: [
      { title: "Paste your text", body: "Paste text, import a web page, or upload an image of text." },
      { title: "Start the rewrite", body: "Optionally allow the rewrite to add brief clarifying context instead of only rewording." },
      { title: "Review the changes", body: "Compare the result with your original in the diff view, then copy what you want." },
    ],
    example: {
      label: "Example, a real run of the tool",
      items: [
        {
          heading: "Before",
          body: "Honey bees are important pollinators. They collect nectar from flowers and carry pollen between plants, which helps many crops produce fruit and seeds. Without bees, farmers would see lower yields and food prices could rise significantly across the world. Protecting bee habitats is therefore a practical concern for agriculture and not only an environmental one.",
        },
        {
          heading: "After",
          body: "Honey bees serve an essential function as pollinators. As they collect nectar from flowers, they move pollen from one plant to another, which supports the development of fruit and seeds in many crops. Without bees, agricultural output would decline, leading to a significant rise in worldwide food costs. Therefore, protecting bee habitats is important for agriculture and goes beyond environmental concerns alone.",
        },
      ],
      note: "Meaning, facts and claims are preserved; only phrasing and rhythm change.",
    },
    goodToKnow: [
      "Review the output before you use it. The tool does not verify factual accuracy.",
      "Very short text is hard to judge for any reader or detector, so a minimum length applies.",
      "It rewrites your wording; it does not promise that any particular AI detector will pass the result.",
    ],
    faq: [
      {
        q: "Will it change my meaning?",
        a: "It is designed to keep your facts and claims and change only phrasing. Always read the result and use the diff view to check.",
      },
      {
        q: "Can I see what it changed?",
        a: "Yes. The diff view highlights every difference from your original text.",
      },
      {
        q: "Is it free?",
        a: "You can sign in and use it on the free plan. Usage limits apply and are shown in the app.",
      },
    ],
  },

  checker: {
    slug: "checker",
    path: "/checker",
    name: "AI Checker",
    h1: "Check whether text was written by AI, and see why.",
    headline: { lead: "Check whether text was written by AI,", emphasis: "and see why." },
    chips: ["Sentence-level highlights", "States its own confidence"],
    features: {
      title: "Decisive answers, not hedging.",
      body: "Detect AI-generated text with sentence-level highlighting and a paragraph-by-paragraph breakdown, plus a free grammar and style pass bundled in. Every result carries an honest disclaimer, not false certainty.",
      bullets: [
        "Sentence-level highlighting of the exact flagged text",
        "Advanced Scan: a paragraph-by-paragraph AI-probability breakdown",
        "Free Writing Feedback: grammar, spelling and clarity issues",
        "States its own false-positive risk instead of overclaiming",
      ],
    },
    cta: { title: "Know what you are reading.", body: "Paste a passage or upload a PDF and see the verdict, the flagged sentences and the signals behind it." },
    intro:
      "Paste text or upload a PDF and get a probability that it is AI-generated, with sentence-level highlights and the writing signals behind the verdict, so the result is explainable rather than just a number.",
    steps: [
      { title: "Paste text or upload a PDF", body: "Check a passage directly, or a whole document." },
      { title: "Read the verdict", body: "See the AI probability, a confidence level and which sentences look most machine-written." },
      { title: "Look at the signals", body: "Sentence variation, vocabulary diversity, overused AI phrases, transition openers and personal voice are shown individually." },
    ],
    example: {
      label: "Example, a real run of the tool",
      items: [
        {
          heading: "Text checked",
          body: "Artificial intelligence has fundamentally transformed the landscape of modern research. Furthermore, it is important to note that these systems leverage vast datasets to deliver robust and comprehensive insights. In conclusion, the integration of AI represents a pivotal paradigm shift across numerous domains, enabling unprecedented efficiency and innovation.",
        },
        {
          heading: "Result",
          body: "98% AI probability, \"likely AI\". Five phrases commonly overused in AI writing were flagged, one in three sentences opened with a transition, and no personal voice was found. Confidence was marked low because the text is short (47 words).",
        },
      ],
      note: "Short texts give low-confidence results, and the tool says so.",
    },
    goodToKnow: [
      "AI detection is probabilistic. Never use a score alone to accuse someone of using AI.",
      "Longer text gives more reliable results than a few sentences.",
      "There is also a Writing Feedback mode that flags grammar, spelling, style, clarity and word-choice issues, with a suggested fix for each.",
    ],
    faq: [
      {
        q: "How accurate is it?",
        a: "No detector is perfect. It combines a language-model judgement with measurable writing signals and reports its confidence, including when it is low.",
      },
      {
        q: "Can it check a PDF?",
        a: "Yes. Upload a PDF and it checks the document's text.",
      },
      {
        q: "Is it free?",
        a: "You can sign in and use it on the free plan. Usage limits apply and are shown in the app.",
      },
    ],
  },
};
