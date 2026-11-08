import { MIXED_VERDICT, SENTENCE_LABELS, TONE_COLOR, VERDICTS, type Tone } from "@/features/checker/verdict";

const ANSWERS = [
  { tone: VERDICTS.likely_human.tone, label: VERDICTS.likely_human.label, meaning: "No strong signs of AI writing." },
  { tone: VERDICTS.uncertain.tone, label: VERDICTS.uncertain.label, meaning: "The signals are mixed. Neither answer is safe to rely on." },
  { tone: MIXED_VERDICT.tone, label: MIXED_VERDICT.label, meaning: "Some sentences read as human, some as AI-written." },
  { tone: VERDICTS.likely_ai.tone, label: VERDICTS.likely_ai.label, meaning: "Looks written or edited by an AI model." },
] satisfies { tone: Tone; label: string; meaning: string }[];

const COLOURS: Tone[] = ["human", "unsure", "ai"];

/** Empty state for the result column: teaches how to read a result before the first check. */
export function HowToRead({ minWords }: { minWords: number }) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="answers-title">
        <h2 id="answers-title" className="text-[14px] font-semibold text-[var(--text-primary)]">
          The answers you can get
        </h2>
        <dl className="mt-3 space-y-3">
          {ANSWERS.map((a) => (
            <div key={a.label} className="flex gap-3">
              <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TONE_COLOR[a.tone].fill }} aria-hidden />
              <div>
                <dt className="text-[13px] font-medium text-[var(--text-primary)]">{a.label}</dt>
                <dd className="text-[12.5px] leading-relaxed text-zinc-400">{a.meaning}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="colours-title">
        <h2 id="colours-title" className="text-[14px] font-semibold text-[var(--text-primary)]">
          How every sentence is coloured
        </h2>
        <ul className="mt-3 space-y-2">
          {COLOURS.map((tone) => (
            <li key={tone} className="flex items-center gap-3 text-[12.5px] text-zinc-400">
              <span className={`sentence-mark sentence-mark--${tone} inline-block h-3.5 w-8`} aria-hidden>
                {" "}
              </span>
              <span>
                <span className="font-medium text-[var(--text-primary)]">{SENTENCE_LABELS[tone].name}</span>: {SENTENCE_LABELS[tone].meaning}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="border-t border-[var(--border-subtle)] pt-4 text-[12px] leading-relaxed text-zinc-400">
        Needs at least {minWords} words of English text. Shorter text can&rsquo;t be judged reliably.
      </p>
    </div>
  );
}
