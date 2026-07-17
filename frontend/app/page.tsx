import Link from "next/link";

const GITHUB_REPO_URL = "https://github.com/akhileshwar03/ai-research-copilot";

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
      />
    </svg>
  );
}

const FEATURES = [
  {
    title: "Grounded answers, cited by page",
    description:
      "Retrieval-augmented generation over your PDFs — every answer is grounded in your documents and cites the exact page it came from.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
        />
      </svg>
    ),
  },
  {
    title: "Real-time streaming responses",
    description:
      "Answers stream token by token over server-sent events, with sources attached — no spinners, no waiting for the full reply.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    title: "A workspace that keeps context",
    description:
      "Pinned documents, persistent chat sessions, and document-aware memory — pick up any research thread exactly where you left it.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.906 2.224v6.75A2.25 2.25 0 004.098 21h15.804a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-1.906-2.224m-16.5 0V6a2.25 2.25 0 012.25-2.25h12a2.25 2.25 0 012.25 2.25v3.776"
        />
      </svg>
    ),
  },
];

const WORKFLOW = [
  { step: "01", title: "Upload", description: "Drop in a PDF — it's parsed, chunked page by page, and embedded into a private vector index." },
  { step: "02", title: "Ask", description: "Ask questions in plain language. Retrieval finds the most relevant passages across your documents." },
  { step: "03", title: "Verify", description: "Every answer streams in with page-level citations, so you can trace each claim back to its source." },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
            <SparkIcon className="h-4 w-4 text-white/80" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Querex</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-zinc-400 transition hover:text-white"
          >
            GitHub
          </a>
          <Link
            href="/login"
            className="rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-black transition hover:bg-zinc-200"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative mx-auto flex max-w-7xl flex-col items-center px-6 pb-24 pt-24 text-center">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-white/[0.03] blur-3xl" />
        </div>

        <div className="relative rounded-full border border-zinc-800 bg-zinc-900/80 px-4 py-1.5 text-[13px] text-zinc-400">
          AI research workspace for your documents
        </div>

        <h1 className="relative mt-8 max-w-4xl text-5xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
          Ask your documents.
          <br />
          <span className="text-zinc-500">Get answers you can verify.</span>
        </h1>

        <p className="relative mt-7 max-w-xl text-[17px] leading-8 text-zinc-400">
          Upload research papers and reports, then have a conversation with them.
          Querex retrieves the relevant passages and answers with page-level
          citations — grounded, streamed, and traceable.
        </p>

        <div className="relative mt-10 flex items-center gap-3">
          <Link
            href="/chat"
            className="rounded-xl bg-white px-7 py-3.5 text-[15px] font-semibold text-black transition hover:bg-zinc-200"
          >
            Open workspace
          </Link>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-7 py-3.5 text-[15px] font-medium text-white transition hover:border-zinc-700 hover:bg-zinc-900"
          >
            View source
          </a>
        </div>

        <p className="relative mt-6 text-[12px] text-zinc-600">
          Free to use · sign in with Google, GitHub, or email
        </p>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-7xl gap-4 px-6 pb-24 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-7 transition hover:border-zinc-700"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-zinc-300 ring-1 ring-white/10">
              {feature.icon}
            </div>
            <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{feature.title}</h3>
            <p className="mt-2.5 text-[14px] leading-7 text-zinc-400">{feature.description}</p>
          </div>
        ))}
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-28">
        <div className="rounded-3xl border border-zinc-800/80 bg-zinc-950/60 px-8 py-12 md:px-12">
          <h2 className="text-center text-2xl font-semibold tracking-tight">How it works</h2>
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            {WORKFLOW.map((item) => (
              <div key={item.step}>
                <span className="font-mono text-[13px] text-zinc-600">{item.step}</span>
                <h3 className="mt-2 text-[15px] font-semibold">{item.title}</h3>
                <p className="mt-2 text-[13.5px] leading-6 text-zinc-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-900">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-[13px] text-zinc-600 md:flex-row">
          <div className="flex items-center gap-2">
            <SparkIcon className="h-3.5 w-3.5" />
            <span>Querex — AI research workspace</span>
          </div>
          <div className="flex items-center gap-5">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-zinc-300"
            >
              GitHub
            </a>
            <Link href="/login" className="transition hover:text-zinc-300">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
