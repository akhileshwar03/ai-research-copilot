import { useMemo } from "react";

import { SENTENCE_LABELS, type Tone } from "@/features/checker/verdict";
import type { CheckResult, SentenceScore } from "@/services/api/checker-api";

const ORDER: Tone[] = ["human", "unsure", "ai"];
/** Groups the sentences back into the paragraphs of the text that was checked. A line break in the gap between
 *  one sentence and the next in the original text starts a new paragraph. If a sentence can't be found in the
 *  original (the server normalised it), no break is added there, so the worst case is one running paragraph. */
function toParagraphs(sentences: SentenceScore[], source: string | undefined) {
  const paragraphs: { sentence: SentenceScore; index: number }[][] = [[]];
  let cursor = 0;
  sentences.forEach((sentence, index) => {
    const at = source ? source.indexOf(sentence.text, cursor) : -1;
    if (at >= 0) {
      if (index > 0 && /\n/.test(source!.slice(cursor, at))) paragraphs.push([]);
      cursor = at + sentence.text.length;
    }
    paragraphs[paragraphs.length - 1].push({ sentence, index });
  });
  return paragraphs;
}

const MUTED = "color-mix(in srgb, var(--paper-text) 62%, transparent)";

/** The checked text on a paper surface, each sentence in the colour of what the model hears, with the colour key
 *  and the limits underneath. Built from the sentences the checker returned, so colours always line up with what was
 *  analysed. A long text scrolls inside a window you can resize by dragging its corner. */
export function AnnotatedDocument({ result, source }: { result: CheckResult; source?: string }) {
  const paragraphs = useMemo(() => toParagraphs(result.sentences, source), [result.sentences, source]);
  const count = (tone: Tone) => result.sentences.filter((s) => s.label === tone).length;

  return (
    <section aria-labelledby="document-title" className="paper-surface min-w-0 rounded-xl p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="document-title" className="text-[13px] font-medium" style={{ color: MUTED }}>
          Your text, sentence by sentence
        </h2>
        <ul aria-label="Colour key" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]" style={{ color: MUTED }}>
          {ORDER.map((tone) => (
            <li key={tone} className="flex items-center gap-1.5">
              <span className={`sentence-mark sentence-mark--${tone} inline-block h-3 w-6`} aria-hidden>
                {" "}
              </span>
              {SENTENCE_LABELS[tone].name} {count(tone)}
            </li>
          ))}
        </ul>
      </div>
      <div
        tabIndex={0}
        aria-label="Your text with each sentence coloured"
        className="h-[360px] min-h-[200px] resize-y overflow-y-auto rounded-lg border px-4 py-4 md:h-[min(620px,70vh)] md:px-6"
        style={{ borderColor: "color-mix(in srgb, var(--paper-text) 14%, transparent)" }}
      >
        <div className="font-reading weight-normal mx-auto max-w-[70ch] space-y-4 text-[14px] leading-[1.75]" style={{ color: "var(--paper-text)" }}>
          {paragraphs.map((paragraph, p) => (
            <p key={p}>
              {paragraph.map(({ sentence, index }) => (
                <span key={index}>
                  <mark
                    id={`sentence-${index}`}
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
          ))}
        </div>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed" style={{ color: MUTED }}>
        {result.disclaimer} A sentence&rsquo;s colour can also depend on the text around it, so treat the colours as a guide.
      </p>
    </section>
  );
}
