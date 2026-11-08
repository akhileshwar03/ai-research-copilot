import { SENTENCE_LABELS, type Tone } from "@/features/checker/verdict";
import type { CheckResult } from "@/services/api/checker-api";

const ORDER: Tone[] = ["human", "unsure", "ai"];

/** The checked text, sentence by sentence, in the colour of what the model hears. Built from the sentences the
 *  checker returned, so the colours always line up with what was analysed (no text matching). */
export function SentenceView({ result }: { result: CheckResult }) {
  const counts = ORDER.map((tone) => ({
    tone,
    count: result.sentences.filter((s) => s.label === tone).length,
  }));

  return (
    <section aria-labelledby="sentence-view-title" className="glass-card rounded-2xl p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2 id="sentence-view-title" className="text-[14px] font-semibold text-[var(--text-primary)]">
          Sentence view
        </h2>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-zinc-400" aria-label="Colour key">
          {counts.map(({ tone, count }) => (
            <li key={tone} className="flex items-center gap-1.5">
              <span className={`sentence-mark sentence-mark--${tone} h-3 w-5`} aria-hidden>
                {" "}
              </span>
              {SENTENCE_LABELS[tone].name}
              <span className="font-data text-[var(--text-primary)]">{count}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="rounded-lg bg-[var(--surface-1)] p-4 text-[14.5px] leading-[1.85] text-zinc-200">
        {result.sentences.map((sentence, i) => (
          <span key={i}>
            <mark
              id={`sentence-${i}`}
              tabIndex={-1}
              className={`sentence-mark sentence-mark--${sentence.label}`}
              title={`${SENTENCE_LABELS[sentence.label].name}: ${SENTENCE_LABELS[sentence.label].meaning}`}
              style={{ color: "inherit" }}
            >
              <span className="sr-only">{SENTENCE_LABELS[sentence.label].name} sentence: </span>
              {sentence.text}
            </mark>{" "}
          </span>
        ))}
      </p>

      <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
        Colours show what the model hears in each sentence. It is usually decisive here, so &ldquo;Unsure&rdquo; is rare.
        They are a guide to where it is most suspicious, not proof about any one sentence.
      </p>
    </section>
  );
}
