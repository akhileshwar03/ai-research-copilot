import { SENTENCE_LABELS, TONE_COLOR, type Tone } from "@/features/checker/verdict";
import type { SentenceScore } from "@/services/api/checker-api";

const ORDER: Tone[] = ["human", "unsure", "ai"];

/** How the sentences read, as counts: "5 human, 3 unsure, 0 AI". Sentence labels come from a separate sentence
 *  model, so these counts can differ from the whole-text verdict above; both are shown on purpose. */
export function SentenceSummary({ sentences }: { sentences: SentenceScore[] }) {
  const counts: Record<Tone, number> = { human: 0, unsure: 0, ai: 0 };
  sentences.forEach((s) => {
    counts[s.label] += 1;
  });
  const total = sentences.length;
  if (total === 0) return null;

  const summary = ORDER.map((t) => `${counts[t]} ${t === "ai" ? "AI" : SENTENCE_LABELS[t].name.toLowerCase()}`).join(", ");

  return (
    <section aria-labelledby="sentence-summary-title" className="space-y-2">
      <h3 id="sentence-summary-title" className="text-[13px] font-medium text-zinc-400">
        How the {total} {total === 1 ? "sentence reads" : "sentences read"}
      </h3>
      <div
        role="img"
        aria-label={summary}
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-[var(--surface-3)]"
      >
        {ORDER.map(
          (t) =>
            counts[t] > 0 && (
              <div key={t} className="h-full" style={{ width: `${(counts[t] / total) * 100}%`, backgroundColor: TONE_COLOR[t].fill }} />
            ),
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-zinc-300">
        {ORDER.map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TONE_COLOR[t].fill }} aria-hidden />
            <span className="font-data font-semibold text-[var(--text-primary)]">{counts[t]}</span>
            <span>{t === "ai" ? "AI" : SENTENCE_LABELS[t].name.toLowerCase()}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
