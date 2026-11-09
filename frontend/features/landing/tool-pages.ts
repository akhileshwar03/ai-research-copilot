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
  /** Optional "two engines" comparison (the Humanizer has Basic and Ultra). */
  engines?: {
    title: string;
    body: string;
    items: {
      name: string;
      kind: string;
      /** Shown as a badge. Keep it true: update it when Ultra's availability changes. */
      status: string;
      statusTone: "live" | "rolling";
      tone: "product" | "purple";
      summary: string;
      points: string[];
    }[];
    note: string;
  };
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
    engines: {
      title: "Two engines. Choose the right one.",
      body: "Humanizer offers two distinct approaches to rewriting: a prompt-engineered pipeline for speed and control, and a purpose-trained model for a different, more natural cadence.",
      items: [
        {
          name: "Basic",
          kind: "Prompt-engineered",
          status: "Available now",
          statusTone: "live",
          tone: "product",
          summary:
            "A multi-pass prompting pipeline on a state-of-the-art language model. It analyses your text, rewrites it under strict meaning-preservation rules, then verifies the result and selectively retries any passage that drifts from your source.",
          points: [
            "Streams live, token by token",
            "Final pass checked by Querex's own AI Checker, with one regeneration if it still reads as machine-written",
            "Word-level diff against your original",
          ],
        },
        {
          name: "Ultra",
          kind: "Purpose-trained model",
          status: "Rolling out",
          statusTone: "rolling",
          tone: "purple",
          summary:
            "A dedicated language model fine-tuned for rewriting, rather than a general-purpose model steered by prompts. It is trained with LoRA on a curated corpus of human-written text that pre-dates generative AI, which gives it a different sentence rhythm and word choice.",
          points: [
            "Fine-tuned for one job, on curated and cleaned training data",
            "Output guards reject rewrites that run away from the source, and resample",
            "Slower by design: it works through your text in chunks",
          ],
        },
      ],
      note: "Ultra is being released gradually. When it is unavailable the app says so, and Basic keeps working. Both modes can make mistakes, so review the output before you use it.",
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
      label: "Example, a real run of the Basic engine",
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
      "Ultra runs a dedicated model, so it is slower than Basic by design. Basic is the fast, always-available option.",
      "It rewrites your wording; it does not promise that any particular AI detector will pass the result.",
    ],
    faq: [
      {
        q: "Will it change my meaning?",
        a: "It is designed to keep your facts and claims and change only phrasing. Always read the result and use the diff view to check.",
      },
      {
        q: "What is the difference between Basic and Ultra?",
        a: "Basic is a prompt-engineered pipeline: a general-purpose model guided through analysis, rewriting and verification passes. Ultra is a purpose-trained model, fine-tuned specifically for rewriting. Basic is faster; Ultra is slower and is being rolled out gradually.",
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
    chips: ["Sentence-level highlights", "Says \"unsure\" when it is"],
    features: {
      title: "An honest answer, including \"unsure\".",
      body: "Find out whether text was written by a person, an AI, or both, with the exact sentences that stand out. Every result states its limits instead of false certainty.",
      bullets: [
        "Three clear answers: likely human, unsure or likely AI",
        "Sentence-by-sentence highlighting of what stands out",
        "Reads PDFs as well as pasted text",
        "Plain-language limits on what it catches and what it misses",
      ],
    },
    cta: { title: "Know what you are reading.", body: "Paste a passage or upload a PDF and see the verdict and the sentences behind it." },
    intro:
      "Paste text or upload a PDF and get one of three answers: likely human, unsure or likely AI, with the sentences that stand out highlighted. The result says what it means and how far to trust it, instead of just a number.",
    steps: [
      { title: "Paste text or upload a PDF", body: "Check a passage directly, or a whole document. Text needs at least 60 words in 3 or more sentences." },
      { title: "Read the verdict", body: "You get likely human, unsure or likely AI, in plain words." },
      { title: "See what stands out", body: "Sentences that look AI-written are highlighted, so you can see where the verdict comes from." },
    ],
    example: {
      label: "Example, a real run of the tool",
      items: [
        {
          heading: "Text checked",
          body: "My grandmother never measured anything. She'd tip flour into a chipped blue bowl until it looked right, swear at the oven, and somehow the bread came out the same every Sunday. I asked her once for the recipe and she laughed. Her hands knew it, not her head. Baking is a skill that requires patience, precision, and attention to detail, and it offers numerous benefits for mental well-being. Furthermore, it is important to note that sharing homemade food can strengthen relationships and foster a sense of community.",
        },
        {
          heading: "Result",
          body: "Unsure. The first three sentences read as uncertain and the last three as AI-like.",
        },
      ],
      note: "A personal story followed by stock phrases. The checker says \"unsure\" when the signals are mixed, instead of guessing.",
    },
    goodToKnow: [
      "AI detection is probabilistic. Never use a result alone to accuse someone of using AI.",
      "It needs at least 60 words in 3 or more sentences and works on English text only.",
      "It is weaker on AI text that a person has edited or that was rewritten to sound human, and it can occasionally flag human writing.",
    ],
    faq: [
      {
        q: "How accurate is it?",
        a: "No detector is perfect. In our own tests on several thousand texts it caught about 85\u201399% of text written by AI models and wrongly flagged about 0\u20134% of human writing. It is weaker on AI text that has been edited or rewritten to sound human. The figures are in the \"What this checker can and can't do\" panel on this page.",
      },
      {
        q: "Why does it sometimes say \"Unsure\"?",
        a: "Because guessing would be worse. A text only gets \"Likely human\" or \"Likely AI\" when the model is clearly on one side. When the signals are mixed, you get \"Unsure\" and the sentences that pulled it each way, so you can judge for yourself. A wrong accusation costs more than a shrug.",
      },
      {
        q: "My own writing was flagged as AI. What now?",
        a: "It can happen: about 0\u20134% of human writing in our tests. A high score is a reason to look closer, not proof. Check which sentences were highlighted, and keep your drafts, notes and version history, which show how a piece was really written.",
      },
      {
        q: "Can it tell if AI text was edited or run through a humanizer?",
        a: "Sometimes. In our tests it caught about 65\u201390% of AI text rewritten by other humanizer tools, but only about 25\u201360% of AI text that a person had edited by hand. That is its hardest case, and the page says so instead of hiding it.",
      },
      {
        q: "Which AI tools does it detect?",
        a: "ChatGPT, Claude, Gemini and other models, including open-source ones. It reads writing patterns, not a watermark, so a brand-new model it has not seen can be harder to catch.",
      },
      {
        q: "Will it match what my school's detector says?",
        a: "Not necessarily. Querex is independent and not connected to Turnitin or any other detector, and different detectors can disagree on the same text. Use ours as a second opinion, not a prediction of someone else's score.",
      },
      {
        q: "Is my text stored?",
        a: "No. We don't save the text you check. It goes over an encrypted connection to our own checker server, is scored, and is not kept.",
      },
      {
        q: "Can it check a PDF, and how long can the text be?",
        a: "Yes to PDFs: upload one with selectable text and you first see the text we read from it, so you can fix it before it is checked. You need at least 60 words in 3 or more sentences, it works on English only, and the text box shows the length limit as you paste.",
      },
      {
        q: "Is it free?",
        a: "You can sign in and use it on the free plan. Usage limits apply and are shown in the app.",
      },
    ],
  },
};
