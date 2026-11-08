/** Inline error for the result panel. The message comes from the API and already names the problem and the way out. */
export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="space-y-3">
      <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">We couldn&rsquo;t check this text</h2>
      <p className="text-[13.5px] leading-relaxed text-zinc-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover-surface"
        >
          Try again
        </button>
      )}
    </div>
  );
}
