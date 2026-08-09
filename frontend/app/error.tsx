"use client";

// Route-segment error boundary. Renders inside the root layout, so it must
// NOT emit <html>/<body> — that would nest documents (only global-error.tsx
// may own the document shell).
export default function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4">
      <div className="glass-card w-full max-w-md rounded-2xl p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
          <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="font-headline text-[17px] font-semibold text-[var(--text-primary)]">Something went wrong</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: "var(--marketing-accent)" }}
          >
            Try again
          </button>
          <a
            href="/chat"
            className="hover-surface rounded-xl border border-[var(--border-subtle)] px-5 py-2.5 text-[13px] font-medium text-zinc-300 transition"
          >
            Back to workspace
          </a>
        </div>
      </div>
    </main>
  );
}
