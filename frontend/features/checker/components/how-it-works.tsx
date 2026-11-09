"use client";

import { useRef, type ReactNode } from "react";
import { EXPECTATIONS } from "./about-checker";
import { splitPercents, TONE_COLOR, type Tone } from "../verdict";

/* The figures below are drawn from how the checker really works (the steps, the cut-offs and the test results), not
 * from stock art. The cut-offs are the server's current setting; the "example" values are illustrative and labelled so. */

const HUMAN_MAX = 35; // a score at or below this is "Likely human"
const AI_MIN = 97; // a score above this is "Likely AI"
const EXAMPLE = { human: 0.18, mixed: 0.09, ai: 0.73 }; // one made-up result, used in two figures so they agree

const STEPS = [
  { title: "Clean", text: "Formatting, emoji and code blocks are stripped out." },
  { title: "Split", text: "The text is cut into sentences." },
  { title: "Group", text: "Sentences are grouped into passages of a few hundred words." },
  { title: "Read", text: "Our trained model reads each passage and scores it, and every sentence in it." },
  { title: "Decide", text: "Passage scores are combined, weighted by length, and compared with two cut-offs." },
];

const SAMPLE_SENTENCES: { text: string; p: number; tone: Tone }[] = [
  { text: "I almost skipped the lecture, honestly, because the bus was late again.", p: 0.12, tone: "human" },
  { text: "Furthermore, it is important to note that effective time management is crucial.", p: 0.91, tone: "ai" },
  { text: "The results were not what we expected.", p: 0.5, tone: "unsure" },
];

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`hiw-${n}`} className="border-t border-[var(--border-medium)] pt-6 first:border-0 first:pt-0">
      <h3 id={`hiw-${n}`} className="font-headline flex items-baseline gap-2.5 text-[17px] font-bold leading-snug">
        <span className="font-data text-[13px] opacity-50">{String(n).padStart(2, "0")}</span>
        {title}
      </h3>
      <div className="mt-2 space-y-3 text-[14px] leading-relaxed opacity-90 [&_p]:max-w-[62ch]">{children}</div>
    </section>
  );
}

function Figure({ label, caption, children }: { label: string; caption?: string; children: ReactNode }) {
  return (
    <figure className="mt-4 rounded-xl border border-[var(--border-medium)] bg-[var(--surface-2)] p-4">
      <div role="img" aria-label={label}>
        {children}
      </div>
      {caption && <figcaption className="mt-3 text-[12.5px] leading-relaxed opacity-70">{caption}</figcaption>}
    </figure>
  );
}

/** Five steps from pasted text to verdict. Vertical on phones, a row on wider screens. */
function Pipeline() {
  return (
    <Figure label="Five steps: clean, split, group, read, decide" caption="Everything runs on our own model and server. Your text is not sent to a third-party AI service.">
      <ol className="grid gap-2 md:grid-cols-5 md:gap-0">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 md:flex-col md:gap-0 md:pr-3">
            <div className="flex items-center md:w-full">
              <span className="font-data flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--marketing-accent)] text-[12px] text-white">
                {i + 1}
              </span>
              {i < STEPS.length - 1 && <span aria-hidden className="ml-2 hidden h-px flex-1 bg-[var(--border-strong,var(--border-medium))] md:block" />}
            </div>
            <div className="md:mt-2.5">
              <p className="text-[13.5px] font-semibold">{s.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug opacity-70">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Figure>
  );
}

/** The 0-100 AI-likelihood scale with the two cut-offs and one example marker. */
function VerdictScale() {
  const score = Math.round((1 - EXAMPLE.human) * 100);
  const zone = (tone: Tone, from: number, to: number) => (
    <div className="h-3.5" style={{ left: `${from}%`, width: `${to - from}%`, backgroundColor: TONE_COLOR[tone].fill, position: "absolute", top: 0, bottom: 0 }} />
  );
  return (
    <Figure
      label={`A scale from 0 to 100. Scores up to ${HUMAN_MAX} are Likely human, above ${HUMAN_MAX} up to ${AI_MIN} are Unsure, above ${AI_MIN} are Likely AI. An example text scoring ${score} is Unsure.`}
      caption={`Example: a text scoring ${score}% (marker) is still “Unsure”, because it has not passed ${AI_MIN}%.`}
    >
      <div className="px-1 pb-1 pt-6">
        <div className="relative h-3.5 rounded-full">
          <div className="absolute inset-0 overflow-hidden rounded-full">
            {zone("human", 0, HUMAN_MAX)}
            {zone("unsure", HUMAN_MAX, AI_MIN)}
            {zone("ai", AI_MIN, 100)}
          </div>
          {/* marker */}
          <span aria-hidden className="absolute -top-1.5 h-6 w-0.5 -translate-x-1/2 rounded bg-[var(--paper-text)]" style={{ left: `${score}%` }} />
          <span aria-hidden className="font-data absolute -top-6 -translate-x-1/2 whitespace-nowrap text-[11px]" style={{ left: `${score}%` }}>
            {score}%
          </span>
          {/* cut-off ticks */}
          {[HUMAN_MAX, AI_MIN].map((t) => (
            <span key={t} aria-hidden className="absolute top-full mt-1 -translate-x-1/2 text-center" style={{ left: `${t}%` }}>
              <span className="font-data text-[11px] opacity-70">{t}%</span>
            </span>
          ))}
        </div>
        <div className="relative mt-7 h-5 text-[12px] font-semibold">
          <span className="absolute left-0" style={{ color: TONE_COLOR.human.text }}>
            Likely human
          </span>
          <span className="absolute -translate-x-1/2" style={{ left: "62%", color: TONE_COLOR.unsure.text }}>
            Unsure
          </span>
          <span className="absolute right-0" style={{ color: TONE_COLOR.ai.text }}>
            Likely AI
          </span>
        </div>
      </div>
    </Figure>
  );
}

/** The model's three-way confidence for one example text, as a stacked bar that adds up to 100. */
function SplitBar() {
  const [h, m, a] = splitPercents(EXAMPLE.human, EXAMPLE.mixed, EXAMPLE.ai);
  const rows: { name: string; pct: number; fill: string }[] = [
    { name: "Human", pct: h, fill: TONE_COLOR.human.fill },
    { name: "Mixed", pct: m, fill: "var(--verdict-mixed-fill)" },
    { name: "AI", pct: a, fill: TONE_COLOR.ai.fill },
  ];
  return (
    <Figure
      label={`Example split: Human ${h}%, Mixed ${m}%, AI ${a}%, adding up to 100%.`}
      caption={`The score used for the verdict (scale below) is 100% minus Human: 100 − ${h} = ${m + a}%. It is a confidence about the whole text, not the share of sentences that are AI.`}
    >
      <div aria-hidden className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full">
        {rows.map((r) => (
          <div key={r.name} style={{ width: `${r.pct}%`, backgroundColor: r.fill }} />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-[13px]">
        {rows.map((r) => (
          <div key={r.name}>
            <dt className="flex items-center gap-1.5 opacity-80">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: r.fill }} />
              {r.name}
            </dt>
            <dd className="font-data mt-0.5 text-[18px] font-semibold">{r.pct}%</dd>
          </div>
        ))}
      </dl>
    </Figure>
  );
}

/** Three sample sentences coloured the way the text view colours them, each with its AI probability. */
function SentenceExample() {
  return (
    <Figure
      label="Three example sentences, each coloured by how likely the model thinks it is AI-written"
      caption="A sentence is Human at 30% or below and AI at 70% or above; in between it is Unsure. Examples are made up."
    >
      <ul className="space-y-2.5">
        {SAMPLE_SENTENCES.map((s) => (
          <li key={s.text} className="flex items-start justify-between gap-3">
            <span className="font-reading text-[14px] leading-[1.7]">
              <span className={`sentence-mark sentence-mark--${s.tone}`}>{s.text}</span>
            </span>
            <span className="font-data shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px]" style={{ backgroundColor: TONE_COLOR[s.tone].soft, color: TONE_COLOR[s.tone].text }}>
              {Math.round(s.p * 100)}% AI
            </span>
          </li>
        ))}
      </ul>
    </Figure>
  );
}

/** Test results by kind of text, drawn from the same figures the "can and can't do" table shows. */
function Results() {
  return (
    <Figure
      label="Results from our own tests, by kind of text"
      caption="Our own tests on several thousand held-out texts at the strict setting. Your texts will differ, so treat these as ranges, not promises."
    >
      <ul className="space-y-3.5">
        {EXPECTATIONS.map((e) => {
          const tone: Tone = e.kind === "flagged" ? "human" : "ai";
          return (
            <li key={e.what}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]">
                <span className="font-medium">{e.what}</span>
                <span className="font-data opacity-80">
                  {e.kind === "flagged" ? "wrongly flagged " : "caught "}
                  {e.lo}–{e.hi}%
                </span>
              </div>
              <div aria-hidden className="relative mt-1.5 h-2 rounded-full bg-[var(--surface-3)]">
                <div className="absolute inset-y-0 rounded-full" style={{ left: `${e.lo}%`, width: `${Math.max(e.hi - e.lo, 1.5)}%`, backgroundColor: TONE_COLOR[tone].fill }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div aria-hidden className="font-data mt-1.5 flex justify-between text-[10.5px] opacity-50">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </Figure>
  );
}

/** The "how does AI detection work?" link and the dialog it opens. Uses the native <dialog>, so focus handling,
 *  Escape to close and the backdrop come with the browser. */
export function HowItWorks({ className }: { className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={className ?? "text-[13px] font-medium text-[var(--marketing-accent-text)] underline decoration-dotted underline-offset-4 hover:decoration-solid"}>
        How our AI Checker works
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="how-it-works-title"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        className="m-auto w-[min(820px,calc(100vw-2rem))] rounded-2xl border border-[var(--border-medium)] bg-[var(--paper-bg)] p-0 text-[var(--paper-text)] shadow-2xl backdrop:bg-black/50"
      >
        <div className="max-h-[88vh] overflow-y-auto p-5 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="how-it-works-title" className="font-headline text-[22px] font-bold leading-tight">
                How the Querex AI Checker works
              </h2>
              <p className="mt-1 max-w-[60ch] text-[13.5px] leading-relaxed opacity-70">
                What happens to your text, what the numbers mean, and where the checker is weak.
              </p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="rounded-md p-1 opacity-60 hover:opacity-100">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="mt-6 space-y-6">
            <Section n={1} title="From your text to a verdict">
              <p>
                People and AI models tend to write differently in ways that are hard to spot by eye: word choice, how sentences are built, how much the rhythm varies. We trained a model on a large collection of
                human-written and AI-written text so it learns those differences.
              </p>
              <Pipeline />
            </Section>

            <Section n={2} title="The score is a confidence, not a percentage of AI">
              <p>
                For the whole text the model gives its confidence in three answers: Human, Mixed (human and AI together) and AI. They always add up to 100%. “AI 95%” means the model is 95% sure about the text as a whole, not
                that 95% of your sentences are AI.
              </p>
              <SplitBar />
            </Section>

            <Section n={3} title="Why it often says “Unsure”">
              <p>
                The verdict is set stricter than the raw split, on purpose. “Likely human” needs a low score, and “Likely AI” needs a very high one. Between the two cut-offs we would rather say “Unsure” than guess, because a
                wrong accusation costs more than a shrug.
              </p>
              <VerdictScale />
            </Section>

            <Section n={4} title="What the colours in your text mean">
              <p>
                Each sentence is scored on its own, then coloured. The model reads the sentences around it too, so the same sentence can score differently in a different passage.
              </p>
              <SentenceExample />
            </Section>

            <Section n={5} title="What it catches, and what it misses">
              <p>
                AI text that a person has edited, or that a humanizer tool has rewritten to sound human, is much harder to catch. The checker also only works on English.
              </p>
              <Results />
            </Section>

            <Section n={6} title="When to believe someone used AI">
              <p>
                Never on a detector result alone. A high AI result is a reason to start a conversation, such as asking about the drafting process or looking at earlier work. It is not proof. No detector, ours included, is
                certain.
              </p>
            </Section>
          </div>
        </div>
      </dialog>
    </>
  );
}
