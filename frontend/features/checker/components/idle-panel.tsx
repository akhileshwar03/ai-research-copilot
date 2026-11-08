import { MIXED_VERDICT, TONE_COLOR, VERDICTS } from "@/features/checker/verdict";

const ORDER = ["likely_human", "uncertain", "likely_mixed", "likely_ai"] as const;

/** Empty state for the result panel: teaches what the three answers mean before the first check. */
export function IdlePanel({ minWords }: { minWords: number }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Your result will appear here</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
          You get one of these answers, and the sentences that led to it.
        </p>
      </div>
      <dl className="space-y-3">
        {ORDER.map((key) => {
          const info = key === "likely_mixed" ? MIXED_VERDICT : VERDICTS[key];
          return (
            <div key={key} className="flex gap-3">
              <span
                className="mt-[7px] h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: TONE_COLOR[info.tone].fill }}
                aria-hidden
              />
              <div>
                <dt className="text-[13px] font-medium text-[var(--text-primary)]">{info.label}</dt>
                <dd className="text-[12.5px] leading-relaxed text-zinc-400">{IDLE_MEANING[key]}</dd>
              </div>
            </div>
          );
        })}
      </dl>
      <p className="border-t border-[var(--border-subtle)] pt-3 text-[12px] leading-relaxed text-zinc-400">
        Needs at least {minWords} words of English text. Shorter text can&rsquo;t be judged reliably.
      </p>
    </div>
  );
}

const IDLE_MEANING: Record<(typeof ORDER)[number], string> = {
  likely_human: "No strong signs of AI writing.",
  uncertain: "The signals are mixed. Neither answer is safe to rely on.",
  likely_mixed: "Some sentences read as human, some as AI-written.",
  likely_ai: "Looks written or edited by an AI model. The sentences that stand out are highlighted.",
};
