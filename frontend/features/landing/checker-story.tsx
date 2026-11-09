"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { splitPercents } from "@/features/checker/verdict";

/* Both pieces below show REAL runs of the checker (model ck_full_1794003388): the scores are what the model
 * returned for these exact texts, not mock numbers. Colours are fixed (not theme tokens) because the marketing
 * pages are always light. */

export type Tone = "human" | "unsure" | "ai";

export const TONE: Record<Tone, { fill: string; text: string; mark: string; soft: string; underline: CSSProperties }> = {
  human: { fill: "#16a34a", text: "#166534", mark: "rgba(34,197,94,0.42)", soft: "rgba(34,197,94,0.14)", underline: { textDecorationLine: "none" } },
  unsure: { fill: "#f08a00", text: "#9a4a00", mark: "rgba(255,140,0,0.46)", soft: "rgba(255,140,0,0.14)", underline: { textDecorationLine: "underline", textDecorationStyle: "dashed", textDecorationColor: "#f08a00" } },
  ai: { fill: "#e5322d", text: "#b91c1c", mark: "rgba(255,45,45,0.42)", soft: "rgba(255,45,45,0.12)", underline: { textDecorationLine: "underline", textDecorationStyle: "solid", textDecorationColor: "#e5322d" } },
};

/** "Mixed" in the Human / Mixed / AI bar: its own colour, so it is not read as the orange "Unsure" of the sentences. */
const MIXED_FILL = "#7c5cd6";

export const toneOf = (p: number): Tone => (p <= 0.3 ? "human" : p >= 0.7 ? "ai" : "unsure");
const EASE = "cubic-bezier(0.23,1,0.32,1)";

/** A passage that mixes a person's own sentences with one AI-sounding one. Real scores from the model. */
const STORY_SENTENCES = [
  { text: "ok so the thing nobody tells you about moving flats is the first night.", p: 0.044 },
  { text: "We had no curtains, no kettle, and one lamp that Dan swore he'd packed.", p: 0.055 },
  { text: "I ate cereal out of a mug.", p: 0.051 },
  { text: "Around midnight the neighbour started playing what I'm pretty sure was a trombone, badly, and we just sat on the floor laughing because what else could you do.", p: 0.042 },
  { text: "Baking is a skill that requires patience, precision, and attention to detail, and it offers numerous benefits for mental well-being.", p: 0.976 },
];
const STORY_WORDS = 84;
const STORY_RESULT = { human: 0.02, mixed: 0.9541, ai: 0.0259 };

const STEPS = [
  { label: "Paste", title: "Paste text or upload a PDF", body: "Check a passage directly, or upload a PDF and see the text we read from it first. It needs at least 60 words in 3 or more sentences, and works on English." },
  { label: "Split", title: "We clean it and split it into sentences", body: "Formatting and emoji are stripped, then the text is cut into sentences and grouped into passages the model can read in one go." },
  { label: "Score", title: "Our trained model scores every sentence", body: "A model we trained on human and AI writing reads each passage and gives every sentence a probability of being AI-written." },
  { label: "Colour", title: "Sentences are coloured by that score", body: "Green at 30% or below, red at 70% or above, orange in between. You can see exactly where the verdict comes from." },
  { label: "Verdict", title: "You get a verdict, and its limits", body: "Human, Mixed and AI add up to 100%. The verdict is held to a stricter bar than the raw split, so a close call comes back as “Unsure” instead of a guess." },
];

export function Mark({ tone, on, children }: { tone: Tone; on: boolean; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <span
      className="rounded-[3px] px-0.5 py-px [box-decoration-break:clone] motion-reduce:transition-none"
      style={{
        backgroundColor: on ? t.mark : "transparent",
        ...(on ? t.underline : { textDecorationLine: "none" }),
        textDecorationThickness: "2px",
        textUnderlineOffset: "3px",
        transition: `background-color 600ms ${EASE}`,
      }}
    >
      {children}
    </span>
  );
}

export function ThreeWayBar({ human, mixed, ai }: { human: number; mixed: number; ai: number }) {
  const [h, m, a] = splitPercents(human, mixed, ai);
  const rows: { name: string; pct: number; fill: string }[] = [
    { name: "Human", pct: h, fill: TONE.human.fill },
    { name: "Mixed", pct: m, fill: MIXED_FILL },
    { name: "AI", pct: a, fill: TONE.ai.fill },
  ];
  return (
    <div>
      <div aria-hidden className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-zinc-200">
        {rows.map((r) => (
          <div key={r.name} style={{ width: `${r.pct}%`, backgroundColor: r.fill }} />
        ))}
      </div>
      <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-zinc-600">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: r.fill }} />
            <dt>{r.name}</dt>
            <dd className="font-data font-semibold text-zinc-900">{r.pct}%</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The sticky window. Everything in it is a function of `step`, so scrolling back plays it in reverse. */
function Stage({ step }: { step: number }) {
  const scored = step >= 2;
  const coloured = step >= 3;
  const verdict = step >= 4;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_30px_60px_-28px_rgba(40,25,10,0.35)]">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200/80 px-4 py-3">
        <p className="text-[12px] font-semibold text-zinc-700">Text checked</p>
        <div className="flex items-center gap-2.5">
          <ol aria-hidden className="flex gap-1">
            {STEPS.map((s, i) => (
              <li key={s.label} className="h-1.5 w-5 rounded-full motion-reduce:transition-none" style={{ backgroundColor: i <= step ? "#1f7a5c" : "#e4e4e7", transition: `background-color 400ms ${EASE}` }} />
            ))}
          </ol>
          <p className="font-data text-[11.5px] text-zinc-500">
            Step {step + 1} of {STEPS.length}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-4 py-3 sm:px-4">
        {step === 0 ? (
          <div key="paste" className="story-fade">
            <div className="rounded-xl border border-zinc-200 bg-[#fffdf8] p-4">
              <p className="font-reading weight-normal text-[13.5px] leading-[1.7] text-[#2a2118]">{STORY_SENTENCES.map((s) => s.text).join(" ")}</p>
            </div>
            <div className="mt-3 flex items-center justify-between text-[12px] text-zinc-500">
              <span>
                <span className="font-data font-semibold text-zinc-800">{STORY_WORDS}</span> words · 60 needed
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">Ready to check</span>
            </div>
          </div>
        ) : (
          <ol key="list" className="story-fade space-y-2">
            {STORY_SENTENCES.map((s, i) => {
              const tone = toneOf(s.p);
              return (
                <li key={s.text} className="grid grid-cols-[1rem_1fr_4rem] items-start gap-2.5">
                  <span className="font-data pt-0.5 text-[11px] text-zinc-500">{i + 1}</span>
                  <span className="font-reading weight-normal text-[12.5px] leading-[1.6] text-[#2a2118]">
                    <Mark tone={tone} on={coloured}>
                      {s.text}
                    </Mark>
                  </span>
                  <span className="pt-1">
                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
                      <span
                        className="block h-full origin-left rounded-full motion-reduce:transition-none"
                        style={{ backgroundColor: TONE[tone].fill, transform: `scaleX(${scored ? Math.max(s.p, 0.04) : 0})`, transition: `transform 700ms ${EASE} ${i * 90}ms` }}
                      />
                    </span>
                    <span className="font-data mt-1 block text-[11px] text-zinc-500 motion-reduce:transition-none" style={{ opacity: scored ? 1 : 0, transition: `opacity 400ms ${EASE} ${i * 90 + 250}ms` }}>
                      {Math.round(s.p * 100)}% AI
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* verdict panel: grows in at the last step */}
      <div className={`grid transition-[grid-template-rows] duration-500 motion-reduce:transition-none ${verdict ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`} style={{ transitionTimingFunction: EASE }}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-zinc-200 bg-zinc-50/80 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2.5">
              <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ backgroundColor: TONE.unsure.soft, color: TONE.unsure.text }}>
                Likely mixed
              </span>
              <span className="text-[12.5px] text-zinc-600">Some sentences read as human, some as AI-written.</span>
            </div>
            <div className="mt-3">
              <ThreeWayBar {...STORY_RESULT} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Left half: the step text, scrolling. Right half: the stage, sticky, changing with the step in view. */
export function CheckerStory() {
  const [step, setStep] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-step]") ?? []);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-42% 0px -42% 0px" },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <section id="how-it-works" className="scroll-mt-24 pb-6 pt-4" aria-labelledby="how-heading">
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#1f7a5c]">How the checker works</p>
        <h2 id="how-heading" className="mt-2 font-headline text-3xl font-bold tracking-tight text-[var(--text-primary)] md:text-4xl">
          From pasted text to a verdict, one step at a time.
        </h2>
        <p className="mt-3 text-[14.5px] leading-7 text-[var(--text-primary)] opacity-70">Scroll to follow a real run. The numbers on the right are what our model returned for this passage.</p>
      </div>

      <div ref={root} className="mt-8 grid gap-6 lg:grid-cols-2 lg:gap-14">
        <div className="sticky top-[var(--sticky-top,1rem)] z-10 h-[400px] self-start lg:order-2 lg:top-[var(--sticky-top,1.5rem)] lg:h-[480px] lg:w-full lg:max-w-[440px] lg:justify-self-end">
          <Stage step={step} />
        </div>
        <ol className="lg:order-1">
          {STEPS.map((s, i) => (
            <li key={s.label} data-step={i} className="flex min-h-[52vh] flex-col justify-center py-6 lg:min-h-[72vh]">
              <div className={`motion-reduce:transition-none ${i === step ? "opacity-100" : "opacity-35"}`} style={{ transition: `opacity 400ms ${EASE}` }}>
                <span className="font-data flex h-9 w-9 items-center justify-center rounded-xl bg-[#1f7a5c]/10 text-[14px] font-bold text-[#1f7a5c]">{i + 1}</span>
                <h3 className="mt-4 font-headline text-[22px] font-bold leading-snug tracking-tight text-[var(--text-primary)] md:text-[26px]">{s.title}</h3>
                <p className="mt-3 max-w-md text-[15px] leading-7 text-[var(--text-primary)] opacity-70">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** The "real run of the tool" card: a faithful miniature of the result screen, with the model's actual numbers for the page's example text. */
const EXAMPLE_SENTENCES = [
  { text: "My grandmother never measured anything.", p: 0.463 },
  { text: "She'd tip flour into a chipped blue bowl until it looked right, swear at the oven, and somehow the bread came out the same every Sunday.", p: 0.387 },
  { text: "I asked her once for the recipe and she laughed.", p: 0.464 },
  { text: "Her hands knew it, not her head.", p: 0.774 },
  { text: "Baking is a skill that requires patience, precision, and attention to detail, and it offers numerous benefits for mental well-being.", p: 0.956 },
  { text: "Furthermore, it is important to note that sharing homemade food can strengthen relationships and foster a sense of community.", p: 0.959 },
];
/** The model's split for this text, as the result screen computes it: human = 1 - score, AI = score - mixed. */
const EXAMPLE_RESULT = { human: 0.0389, mixed: 0.1883, ai: 0.7728 };

export function CheckerExampleCard({ label, note, accent }: { label: string; note: string; accent: string }) {
  return (
    <figure className="relative ml-auto w-full max-w-[460px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_28px_56px_-30px_rgba(40,25,10,0.38)]">
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} aria-hidden />
      <figcaption className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: accent }}>
          {label.replace(/^Example, /, "").replace(/ of the tool$/, "")}
        </span>
        <span className="font-data shrink-0 whitespace-nowrap rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] text-zinc-500">88 words</span>
      </figcaption>

      <div className="space-y-2.5 px-5">
        <div className="rounded-xl border border-zinc-200 bg-[#fffdf8] p-3.5">
          <p className="font-reading weight-normal text-[12.5px] leading-[1.75] text-[#2a2118]">
            {EXAMPLE_SENTENCES.map((s) => (
              <span key={s.text}>
                <Mark tone={toneOf(s.p)} on>
                  {s.text}
                </Mark>{" "}
              </span>
            ))}
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3.5" style={{ borderLeft: `3px solid ${TONE.unsure.fill}` }}>
          <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ backgroundColor: TONE.unsure.soft, color: TONE.unsure.text }}>
            Unsure
          </span>
          <div className="min-w-0 flex-1">
            <ThreeWayBar {...EXAMPLE_RESULT} />
          </div>
        </div>
      </div>

      <p className="px-5 pb-4 pt-3 text-[12px] leading-5 text-zinc-500">{note}</p>
    </figure>
  );
}
