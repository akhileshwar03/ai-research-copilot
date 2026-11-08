import { SENTENCE_LABELS } from "@/features/checker/verdict";
import type { CheckResult } from "@/services/api/checker-api";

/** The checked text on a paper surface, each sentence in the colour of what the model hears. Built from the
 *  sentences the checker returned, so the colours always line up with what was analysed (no text matching).
 *  A long text scrolls inside a window you can resize by dragging its corner, like the text box. */
export function AnnotatedDocument({ result }: { result: CheckResult }) {
  return (
    <section aria-labelledby="document-title" className="paper-surface min-w-0 rounded-2xl p-5 md:p-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="document-title" className="text-[13px] font-medium" style={{ color: "color-mix(in srgb, var(--paper-text) 60%, transparent)" }}>
          Your text, sentence by sentence
        </h2>
        <p className="text-[12px]" style={{ color: "color-mix(in srgb, var(--paper-text) 55%, transparent)" }}>
          Scroll, or drag the corner to resize
        </p>
      </div>
      <div
        tabIndex={0}
        aria-label="Your text with each sentence coloured"
        className="h-[420px] min-h-[200px] resize-y overflow-y-auto rounded-lg border px-5 py-6 md:h-[520px] md:px-8"
        style={{ borderColor: "color-mix(in srgb, var(--paper-text) 14%, transparent)" }}
      >
        <p className="font-reading mx-auto max-w-[66ch] text-[17px] leading-[1.9]" style={{ color: "var(--paper-text)" }}>
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
      </div>
    </section>
  );
}
