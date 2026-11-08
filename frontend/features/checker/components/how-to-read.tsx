import { SENTENCE_LABELS, type Tone } from "@/features/checker/verdict";

const COLOURS: Tone[] = ["human", "unsure", "ai"];

/** Empty state of the result panel: where the answer will appear, and what the colours will mean. */
export function HowToRead({ minWords }: { minWords: number }) {
  return (
    <div className="flex min-h-[200px] flex-col justify-between gap-5">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 text-[13px] font-bold text-[var(--text-primary)]"
          style={{ borderColor: "var(--border-medium)" }}
          aria-hidden
        >
          AI
        </span>
        <p className="text-[14px] text-zinc-400">Your result will appear here.</p>
      </div>
      <div>
        <ul aria-label="Colour key" className="space-y-1.5">
          {COLOURS.map((tone) => (
            <li key={tone} className="flex items-center gap-2.5 text-[12.5px] text-zinc-400">
              <span className={`sentence-mark sentence-mark--${tone} inline-block h-3 w-6 shrink-0`} aria-hidden>
                {" "}
              </span>
              <span>
                <span className="font-medium text-[var(--text-primary)]">{SENTENCE_LABELS[tone].name}</span>: {SENTENCE_LABELS[tone].meaning}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-[12px] text-zinc-400">
          Needs at least {minWords} words of English text.
        </p>
      </div>
    </div>
  );
}
