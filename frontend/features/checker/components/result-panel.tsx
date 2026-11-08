import { TONE_COLOR, presentVerdict, splitOf } from "@/features/checker/verdict";
import { ScoreSplit } from "@/features/checker/components/score-split";
import { SentenceMap } from "@/features/checker/components/sentence-map";
import type { CheckResult } from "@/services/api/checker-api";

export function ResultPanel({ result, onHumanize }: { result: CheckResult; onHumanize?: () => void }) {
  const info = presentVerdict(result);
  const color = TONE_COLOR[info.tone];
  const { human, mixed, ai } = splitOf(result);
  // "Unsure" with a mix-leaning split gets one extra line; "Likely mixed" already says it.
  const showsMix = result.verdict === "uncertain" && mixed >= 0.5;

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-4" style={{ backgroundColor: color.soft }}>
        <h2 className="font-headline text-[28px] font-bold leading-none tracking-tight" style={{ color: color.text }}>
          {info.label}
        </h2>
        <p className="mt-3 text-[15px] font-medium leading-snug text-[var(--text-primary)]">{info.headline}</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-zinc-300">{info.detail}</p>
      </div>

      <ScoreSplit human={human} mixed={mixed} ai={ai} words={result.word_count} />

      {showsMix && (
        <p className="rounded-lg bg-[var(--surface-0)] px-3 py-2.5 text-[13px] leading-relaxed text-zinc-300">
          The model leans toward a mix of human and AI writing, but it isn&rsquo;t sure which parts.
        </p>
      )}

      {result.sentences.length > 0 && <SentenceMap sentences={result.sentences} />}

      {result.verdict === "likely_ai" && onHumanize && (
        <button
          type="button"
          onClick={onHumanize}
          className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover-surface"
        >
          Rewrite this text in the Humanizer
        </button>
      )}

      <p className="border-t border-[var(--border-subtle)] pt-3 text-[12px] leading-relaxed text-zinc-400">
        {result.disclaimer}
      </p>
    </div>
  );
}
