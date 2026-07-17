import Link from "next/link";

import { LiveDemoWidget } from "@/features/landing/live-demo-widget";

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
    title: "Cited by page, not by vibe",
    description:
      "Every answer is grounded in your documents and points to the exact page it came from — trace any claim back to its source in one click.",
    span: "lg" as const,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: "Streams in real time",
    description: "Token-by-token responses over server-sent events — no spinners, no waiting for the full reply.",
    span: "sm" as const,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    title: "Compares across documents",
    description: "Select multiple PDFs and ask one question across all of them — synthesis, not just retrieval.",
    span: "sm" as const,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
  },
  {
    title: "Remembers the thread",
    description:
      "Pinned documents and persistent sessions — pick up any research conversation exactly where you left it, days later.",
    span: "lg" as const,
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
  { step: "01", title: "Upload", description: "Drop in a PDF — it's parsed page by page and embedded into a private vector index." },
  { step: "02", title: "Ask", description: "Ask in plain language. Retrieval finds the passages that actually answer your question." },
  { step: "03", title: "Verify", description: "Every answer streams in with a page citation, so you can check it against the source." },
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

      {/* ── Hero: asymmetric split, not the usual dead-centered stack ───────── */}
      <section className="relative overflow-hidden">
        <div
          className="bg-grain pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(700px 500px at 15% 20%, var(--marketing-accent-soft), transparent 60%)",
          }}
          aria-hidden
        />

        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-24">
          {/* Left: headline + CTA */}
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px]"
              style={{ borderColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--marketing-accent)" }} />
              AI research workspace for your documents
            </div>

            <h1
              className="mt-7 text-5xl font-normal leading-[1.08] tracking-tight md:text-[3.75rem]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Ask your documents.
              <br />
              <span className="italic text-zinc-500">Get answers</span> you
              <br />
              can verify.
            </h1>

            <p className="mt-7 max-w-lg text-[16px] leading-8 text-zinc-400">
              Upload research papers and reports, then have a conversation with them.
              Querex retrieves the relevant passages and answers with page-level
              citations — grounded, streamed, and traceable.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
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

            <p className="mt-5 text-[12px] text-zinc-600">
              Free to use · sign in with Google, GitHub, or email
            </p>
          </div>

          {/* Right: the actual product, shown not described */}
          <div className="flex justify-center lg:justify-end">
            <LiveDemoWidget />
          </div>
        </div>
      </section>

      {/* ── Features: bento grid, not three identical cards ─────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="grid gap-4 md:grid-cols-2">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className={[
                "group rounded-2xl border border-zinc-800/80 bg-zinc-950 p-7 transition hover:border-zinc-700",
                feature.span === "lg" ? "md:col-span-2" : "md:col-span-1",
              ].join(" ")}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-white/10 transition-colors group-hover:ring-[var(--marketing-accent-soft)]"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "var(--marketing-accent-text)" }}
              >
                {feature.icon}
              </div>
              <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-white">{feature.title}</h3>
              <p className="mt-2.5 text-[14px] leading-7 text-zinc-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-28">
        <div className="rounded-3xl border border-zinc-800/80 bg-zinc-950/60 px-8 py-12 md:px-12">
          <h2 className="text-center text-2xl font-normal tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            How it works
          </h2>
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            {WORKFLOW.map((item) => (
              <div key={item.step}>
                <span className="font-mono text-[13px]" style={{ color: "var(--marketing-accent-text)" }}>
                  {item.step}
                </span>
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
