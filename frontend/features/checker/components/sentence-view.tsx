import type { CheckResult } from "@/services/api/checker-api";

/** The checked text sentence by sentence, with the AI-like ones marked. Built from the sentences the checker
 *  returned, so the marks always line up with what was actually analysed (no text matching). */
export function SentenceView({ result }: { result: CheckResult }) {
  const flagged = result.sentences.filter((s) => s.flagged).length;

  return (
    <section aria-labelledby="sentence-view-title" className="glass-card rounded-2xl p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="sentence-view-title" className="text-[14px] font-semibold text-[var(--text-primary)]">
          Sentence view
        </h2>
        <p className="flex items-center gap-2 text-[12.5px] text-zinc-400">
          {flagged > 0 && (
            <span className="flagged-sentence" aria-hidden>
              Sample
            </span>
          )}
          {flagged} of {result.sentences.length} sentences look AI-written
        </p>
      </div>

      {result.verdict === "likely_human" ? (
        <p className="text-[13.5px] leading-relaxed text-zinc-400">
          Nothing is highlighted because the text as a whole reads as human. Individual sentences can still look
          AI-like on their own; one on its own isn&rsquo;t evidence.
        </p>
      ) : (
        <p className="rounded-lg bg-[var(--surface-0)] p-4 text-[14px] leading-[1.75] text-zinc-300">
          {result.sentences.map((sentence, i) => (
            <span key={i}>
              {sentence.flagged ? (
                <mark className="flagged-sentence">
                  <span className="sr-only">AI-like sentence: </span>
                  {sentence.text}
                </mark>
              ) : (
                sentence.text
              )}{" "}
            </span>
          ))}
        </p>
      )}

      <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
        Highlights are a guide to where the model is most suspicious, not proof about any one sentence.
      </p>
    </section>
  );
}
