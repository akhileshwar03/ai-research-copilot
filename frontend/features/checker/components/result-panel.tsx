import { VERDICTS } from "@/features/checker/verdict";
import { VerdictBadge } from "@/features/checker/components/verdict-badge";
import type { CheckResult } from "@/services/api/checker-api";

const pct = (value: number) => `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

export function ResultPanel({ result, onHumanize }: { result: CheckResult; onHumanize?: () => void }) {
  const info = VERDICTS[result.verdict];
  const flagged = result.sentences.filter((s) => s.flagged).length;
  const showsMix = result.verdict !== "likely_human" && result.mixed_probability >= 0.5;

  // The model's three-way split of its own estimate. Shown as detail only: the verdict above is what
  // the checker actually decided, and these shares can read more confident than the verdict is.
  const human = 1 - result.ai_score;
  const mixed = result.mixed_probability;
  const ai = Math.max(0, result.ai_score - mixed);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <VerdictBadge tone={info.tone} label={info.label} />
        <h2 className="font-headline text-[18px] font-bold leading-snug text-[var(--text-primary)]">{info.headline}</h2>
        <p className="text-[13.5px] leading-relaxed text-zinc-400">{info.detail}</p>
      </div>

      {showsMix && (
        <p className="rounded-lg bg-[var(--surface-0)] px-3 py-2.5 text-[13px] leading-relaxed text-zinc-300">
          The model leans toward a mix of human and AI writing, but it isn&rsquo;t sure which parts.
        </p>
      )}

      {result.verdict !== "likely_human" && result.sentences.length > 0 && (
        <p className="text-[13px] text-zinc-400">
          {flagged === 0
            ? "No single sentence stands out; the signal is spread across the whole text."
            : `${flagged} of ${result.sentences.length} sentences stand out. See the sentence view below.`}
        </p>
      )}

      {result.verdict === "likely_ai" && onHumanize && (
        <button
          type="button"
          onClick={onHumanize}
          className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover-surface"
        >
          Rewrite this text in the Humanizer
        </button>
      )}

      <details className="group rounded-lg border border-[var(--border-subtle)]">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] font-medium text-zinc-300 marker:hidden">
          How the model scored this
        </summary>
        <div className="space-y-3 border-t border-[var(--border-subtle)] px-3 py-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              { name: "Human", value: human },
              { name: "Mixed", value: mixed },
              { name: "AI", value: ai },
            ].map((row) => (
              <div key={row.name} className="rounded-md bg-[var(--surface-0)] px-2 py-2">
                <dt className="text-[12px] text-zinc-400">{row.name}</dt>
                <dd className="font-data text-[15px] font-semibold text-[var(--text-primary)]">{pct(row.value)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[12px] leading-relaxed text-zinc-400">
            The model&rsquo;s own split of its estimate for {result.word_count.toLocaleString()} words. These shares can
            look more certain than the verdict, which is set more cautiously. Rely on the verdict, not on these numbers.
          </p>
        </div>
      </details>

      <p className="border-t border-[var(--border-subtle)] pt-3 text-[12px] leading-relaxed text-zinc-400">
        {result.disclaimer}
      </p>
    </div>
  );
}
