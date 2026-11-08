/** Loading state for the result panel: the shape of the result, so nothing jumps when it arrives. */
export function ResultSkeleton() {
  const bar = "rounded bg-[var(--surface-3)] motion-safe:animate-pulse";
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <p className="text-[13px] font-medium text-[var(--text-primary)]">Checking your text…</p>
      <div className={`${bar} h-7 w-28 rounded-full`} />
      <div className={`${bar} h-5 w-4/5`} />
      <div className="space-y-2">
        <div className={`${bar} h-3.5 w-full`} />
        <div className={`${bar} h-3.5 w-11/12`} />
        <div className={`${bar} h-3.5 w-2/3`} />
      </div>
      <p className="text-[12px] text-zinc-400">This should only take a moment.</p>
    </div>
  );
}
