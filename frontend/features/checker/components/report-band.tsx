import { HowItWorks } from "@/features/checker/components/how-it-works";
import { MIXED_VERDICT, TONE_COLOR, headlineOf, presentVerdict, splitOf } from "@/features/checker/verdict";
import { VerdictMeter } from "@/features/checker/components/verdict-meter";
import { SentenceSummary } from "@/features/checker/components/sentence-summary";
import { ScoreSplit } from "@/features/checker/components/score-split";
import { SentenceMap } from "@/features/checker/components/sentence-map";
import type { CheckResult } from "@/services/api/checker-api";

const BUTTON =
  "rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover-surface";

/** The result at the top of the report: the verdict, the model's split, and the sentence map. */
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
  const tip =
    info === MIXED_VERDICT || result.level === "mixed"
      ? "The model reads this as a mix of human and AI writing, for example AI text a person has edited. It is a strong signal about the whole text, not proof about any sentence."
      : result.verdict === "likely_human" && result.level !== "unsure"
        ? "The model found no strong signs of AI writing. This is a judgement about the whole text, not proof that a person wrote it."
        : result.verdict === "uncertain"
          ? "The signals are mixed, so the checker won't call it either way. Read this as \u201Ccan\u2019t tell\u201D, not as a hidden answer."
          : "The model reads this as written or edited by AI. It is a strong signal, not proof, so never use it alone to accuse someone.";
  const showsMix = !result.level && result.verdict === "uncertain" && mixed >= 0.5;

  return (
    <aside aria-label="Result" className="glass-card space-y-5 rounded-xl p-5 lg:sticky lg:top-4 lg:self-start" style={{ borderTop: `4px solid ${color.fill}` }}>
      <VerdictMeter
        label={info.label}
        tone={info.tone}
        headline={info.headline}
        detail={`${info.detail}${showsMix ? " The model leans toward a mix of human and AI writing, but isn\u2019t sure which parts." : ""}`}
        tip={tip}
        {...headlineOf(result)}
      />

      <details className="group rounded-lg border border-[var(--border-subtle)] px-3 py-2">
        <summary className="cursor-pointer list-none text-[13px] font-medium text-zinc-300 marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            Show how the model scored this
            <svg className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </summary>
        <div className="pt-3">
          <ScoreSplit human={human} mixed={mixed} ai={ai} />
        </div>
      </details>
      {result.sentences.length > 0 && <SentenceSummary sentences={result.sentences} />}
      {result.sentences.length > 0 && <SentenceMap sentences={result.sentences} />}

      <HowItWorks />

      <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-4">
        {result.verdict === "likely_ai" && onHumanize && (
          <button type="button" onClick={onHumanize} className={BUTTON}>
            Rewrite in the Humanizer
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onEdit} className={BUTTON}>
            Edit text
          </button>
          <button type="button" onClick={onReset} className={BUTTON}>
            Check another
          </button>
        </div>
      </div>
    </aside>
  );
}
