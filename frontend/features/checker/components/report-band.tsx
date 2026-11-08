import { HowItWorks } from "@/features/checker/components/how-it-works";
import { InfoTip } from "@/features/checker/components/info-tip";
import { MIXED_VERDICT, TONE_COLOR, presentVerdict, splitOf } from "@/features/checker/verdict";
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
    info === MIXED_VERDICT
      ? "The model reads this as a mix of human and AI writing, for example AI text a person has edited. It is a strong signal about the whole text, not proof about any sentence."
      : result.verdict === "likely_human"
        ? "The model found no strong signs of AI writing. This is a judgement about the whole text, not proof that a person wrote it."
        : result.verdict === "uncertain"
          ? "The signals are mixed, so the checker won't call it either way. Read this as \u201Ccan\u2019t tell\u201D, not as a hidden answer."
          : "The model reads this as written or edited by AI. It is a strong signal, not proof, so never use it alone to accuse someone.";
  const showsMix = result.verdict === "uncertain" && mixed >= 0.5;

  return (
    <aside aria-label="Result" className="glass-card space-y-5 rounded-xl p-5 lg:sticky lg:top-4 lg:self-start" style={{ borderTop: `4px solid ${color.fill}` }}>
      <div>
        <h2 className="flex items-center gap-2 font-headline text-[24px] font-bold leading-tight" style={{ color: color.text }}>
          {info.label}
          <InfoTip id="verdict-tip" label="What this result means">
            {tip}
          </InfoTip>
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-300">
          {info.headline} {info.detail}
          {showsMix && " The model leans toward a mix of human and AI writing, but isn\u2019t sure which parts."}
        </p>
      </div>

      <ScoreSplit human={human} mixed={mixed} ai={ai} />
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
