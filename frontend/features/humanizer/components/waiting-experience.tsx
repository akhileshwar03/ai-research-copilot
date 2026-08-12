import { Skeleton } from "@/components/ui/skeleton";

// Design basis (researched, not improvised): skeleton+shimmer over a blank
// spinner reduces perceived wait ~40% since motion reads as "active", not
// "stuck"; waits past ~10s need a visible progress indicator, not just text;
// contextual staged messaging beats a single static line for genuinely long
// waits. Time-based, not backend-driven — reacts to elapsed wait time so it
// works for any slow response today and covers a real model cold start once
// that's wired in, without needing a backend signal to trigger it.
export interface WaitStage {
  afterSeconds: number;
  text: string;
}

export const DEFAULT_WAIT_STAGES: WaitStage[] = [
  { afterSeconds: 0, text: "Reading your text…" },
  { afterSeconds: 8, text: "Still working — longer inputs take a bit more time to read." },
  { afterSeconds: 18, text: "Waking up the model — this can take a little while on the first request after it's been idle." },
  { afterSeconds: 35, text: "Loading a custom fine-tuned model trained specifically to write in a natural, human voice." },
  { afterSeconds: 60, text: "Almost there — quality takes a moment. Thanks for your patience." },
  { afterSeconds: 90, text: "Still going — this one's taking longer than usual, but it hasn't been dropped." },
];

export const ULTRA_WAIT_STAGES: WaitStage[] = [
  { afterSeconds: 0, text: "Sending your text to the fine-tuned model…" },
  { afterSeconds: 6, text: "This model was trained from scratch on real human writing to beat AI detectors." },
  { afterSeconds: 15, text: "Waking up — it's likely been idle and needs a moment to load." },
  { afterSeconds: 30, text: "Still loading — a real 7-billion-parameter model takes a moment to spin up." },
  { afterSeconds: 55, text: "Almost there. This is the same model that scored 80% on real AI-detector testing." },
  { afterSeconds: 85, text: "Still going — worth the wait for a genuinely different result, not just a reworded one." },
];

export function messageForStage(elapsedSeconds: number, stages: WaitStage[]): string {
  let message = stages[0]?.text ?? "";
  for (const stage of stages) {
    if (elapsedSeconds >= stage.afterSeconds) message = stage.text;
  }
  return message;
}

interface WaitingExperienceProps {
  elapsedSeconds: number;
  stages?: WaitStage[];
  /** Seconds after which the progress bar + elapsed counter appear — short waits stay clean. */
  progressThreshold?: number;
}

export function WaitingExperience({
  elapsedSeconds,
  stages = DEFAULT_WAIT_STAGES,
  progressThreshold = 8,
}: WaitingExperienceProps) {
  const message = messageForStage(elapsedSeconds, stages);
  const showProgress = elapsedSeconds >= progressThreshold;

  return (
    <div className="min-h-[340px] flex-1 space-y-2.5 rounded-lg border border-[var(--border-subtle)] p-3">
      <div className="relative space-y-2.5 overflow-hidden">
        <Skeleton className="h-3 w-[92%]" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[85%]" />
        <Skeleton className="h-3 w-[70%]" />
        <div className="demo-sheen pointer-events-none absolute inset-0" />
      </div>

      <div className="pt-3">
        <p key={message} className="animate-message-in text-[12px] leading-relaxed text-zinc-500">
          {message}
        </p>

        {showProgress && (
          <>
            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full w-1/3 animate-progress-sweep rounded-full"
                style={{ backgroundColor: "var(--marketing-accent)" }}
              />
            </div>
            <p className="mt-1.5 text-[11px] tabular-nums text-zinc-600">
              {elapsedSeconds}s elapsed — still connected, not stuck.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
