import { SENTENCE_LABELS, type Tone } from "@/features/checker/verdict";
import type { CheckResult } from "@/services/api/checker-api";

const ORDER: Tone[] = ["human", "unsure", "ai"];

/** Colour key with live counts, plus the limits of the colours and the result's disclaimer. */
export function ReadingRail({ result }: { result: CheckResult }) {
  return (
    <aside aria-label="How to read the colours" className="glass-card order-first space-y-5 rounded-2xl p-5 lg:order-none lg:sticky lg:top-6 lg:self-start">
      <div>
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Reading the colours</h2>
        <ul className="mt-3 space-y-2.5">
          {ORDER.map((tone) => (
            <li key={tone} className="flex items-center gap-3 text-[12.5px] text-zinc-400">
              <span className={`sentence-mark sentence-mark--${tone} inline-block h-3.5 w-8 shrink-0`} aria-hidden>
                {" "}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-[var(--text-primary)]">{SENTENCE_LABELS[tone].name}</span>: {SENTENCE_LABELS[tone].meaning}
              </span>
              <span className="font-data text-[13px] text-[var(--text-primary)]">{result.sentences.filter((s) => s.label === tone).length}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
          The model is usually decisive about a sentence, so &ldquo;Unsure&rdquo; is rare. A sentence&rsquo;s colour can also
          depend on the text around it, and the colours are a guide, not proof about any one sentence.
        </p>
      </div>
      <p className="border-t border-[var(--border-subtle)] pt-4 text-[12px] leading-relaxed text-zinc-400">{result.disclaimer}</p>
    </aside>
  );
}
