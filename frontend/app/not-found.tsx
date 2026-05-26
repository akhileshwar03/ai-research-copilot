import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-80 w-[500px] -translate-x-1/2 rounded-full bg-white/[0.012] blur-3xl" />
      </div>

      <div className="relative text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.05] ring-1 ring-[var(--border-medium)]">
          <svg className="h-8 w-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        {/* Giant number */}
        <p className="text-[80px] font-bold leading-none text-white/[0.05] select-none">404</p>

        <h1 className="mt-1 text-[18px] font-semibold text-white">Page not found</h1>
        <p className="mt-2 text-[13px] text-zinc-500 max-w-xs mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/chat"
            className="rounded-xl bg-white px-5 py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100"
          >
            Go to workspace
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-[var(--border-medium)] px-5 py-2.5 text-[13px] font-medium text-zinc-400 transition hover:border-[var(--border-strong)] hover:text-zinc-200"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
