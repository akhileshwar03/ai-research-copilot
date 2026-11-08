import { SENTENCE_LABELS, TONE_COLOR, presentVerdict, splitOf, type Tone } from "@/features/checker/verdict";
import { ScoreSplit } from "@/features/checker/components/score-split";
import { SentenceMap } from "@/features/checker/components/sentence-map";
import type { CheckResult } from "@/services/api/checker-api";

const BUTTON =
  "rounded-lg border border-[var(--border-strong)] px-3.5 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover-surface";

/** The result, as a report header: the verdict first and largest, then the model's split and the sentence map. */
export function ReportBand({
  result,
  onEdit,
  onReset,
  onHumanize,
}: {
  result: CheckResult;
  onEdit: () => void;
  onReset: () => void;
  onHumanize?: () => void;
}) {
  const info = presentVerdict(result);
  const color = TONE_COLOR[info.tone];
  const { human, mixed, ai } = splitOf(result);
  const showsMix = result.verdict === "uncertain" && mixed >= 0.5;
  const sentenceCount = (tone: Tone) => result.sentences.filter((s) => s.label === tone).length;

  return (
    <section
      aria-label="Result"
      className="rounded-2xl p-6 md:p-8"
      style={{
        backgroundColor: "var(--surface-1)",
        backgroundImage: `linear-gradient(${color.soft}, ${color.soft})`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color.text} 24%, transparent)`,
      }}
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
        <div>
          <h2 className="verdict-in font-headline text-[44px] font-bold leading-[1.02] tracking-tight" style={{ color: color.text }}>
            {info.label}
          </h2>
          <p className="mt-4 text-[17px] font-medium leading-snug text-[var(--text-primary)]">{info.headline}</p>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-zinc-300">{info.detail}</p>
          {showsMix && (
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-zinc-300">
              The model leans toward a mix of human and AI writing, but it isn&rsquo;t sure which parts.
            </p>
          )}
        </div>
        <div className="space-y-5">
          <ScoreSplit human={human} mixed={mixed} ai={ai} words={result.word_count} />
          {result.sentences.length > 0 && <SentenceMap sentences={result.sentences} />}
        </div>
      </div>

      <div
        className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
        style={{ borderColor: `color-mix(in srgb, ${color.text} 22%, transparent)` }}
      >
        <p className="text-[12.5px] text-zinc-300">
          {result.word_count.toLocaleString()} words, {result.sentences.length} sentences:{" "}
          {(["human", "unsure", "ai"] as Tone[]).map((tone, i) => (
            <span key={tone}>
              {i > 0 && ", "}
              {sentenceCount(tone)} {SENTENCE_LABELS[tone].name.toLowerCase()}
            </span>
          ))}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onEdit} className={BUTTON}>
            Edit text
          </button>
          {result.verdict === "likely_ai" && onHumanize && (
            <button type="button" onClick={onHumanize} className={BUTTON}>
              Rewrite in the Humanizer
            </button>
          )}
          <button type="button" onClick={onReset} className={BUTTON}>
            Check another text
          </button>
        </div>
      </div>
    </section>
  );
}
