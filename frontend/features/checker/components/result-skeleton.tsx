import { ProgressNote } from "@/features/checker/components/progress-note";

/** Loading state for the result column: visible progress, then the shape of the result so nothing jumps. */
export function ResultSkeleton() {
  const bar = "rounded bg-[color-mix(in_srgb,var(--text-primary)_22%,transparent)] motion-safe:animate-pulse";
  return (
    <div className="space-y-5">
      <ProgressNote label="Checking your text…" hint="This should only take a moment." />
      <div className="space-y-4" aria-hidden>
        <div className={`${bar} h-9 w-40`} />
        <div className="space-y-2">
          <div className={`${bar} h-3.5 w-full`} />
          <div className={`${bar} h-3.5 w-11/12`} />
          <div className={`${bar} h-3.5 w-2/3`} />
        </div>
      </div>
    </div>
  );
}
