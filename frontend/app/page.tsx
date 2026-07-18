import Link from "next/link";

import { LiveDemoWidget } from "@/features/landing/live-demo-widget";
import { Reveal, Tilt3D } from "@/features/landing/motion";

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
    <main className="marketing-light min-h-screen bg-[#faf9f7] text-zinc-900">
      {/* ── Navigation: sticky, frosted ────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 border-b border-black/[0.05] bg-[#faf9f7]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-md shadow-zinc-900/20">
              <SparkIcon className="h-4 w-4" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Querex</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-zinc-500 transition hover:text-zinc-900"
            >
              GitHub
            </a>
            <Link
              href="/login"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white shadow-md shadow-zinc-900/20 transition hover:bg-zinc-700"
            >
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero: asymmetric split with 3D demo ────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Ambient color wash + grain */}
        <div
          className="bg-grain pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(700px 480px at 12% 12%, rgba(224,138,62,0.12), transparent 60%), radial-gradient(600px 420px at 95% 70%, rgba(224,138,62,0.07), transparent 60%)",
          }}
          aria-hidden
        />

        <div className="relative mx-auto grid max-w-7xl gap-14 px-6 pb-28 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
          {/* Left: headline + CTA */}
          <div>
            <Reveal>
              <div
                className="inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-[13px] shadow-sm"
                style={{ borderColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--marketing-accent)" }} />
                AI research workspace for your documents
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1
                className="mt-7 text-5xl font-normal leading-[1.08] tracking-tight text-zinc-900 md:text-[3.75rem]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Ask your documents.
                <br />
                <span className="italic text-zinc-400">Get answers</span> you
                <br />
                can verify.
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-7 max-w-lg text-[16px] leading-8 text-zinc-600">
                Upload research papers and reports, then have a conversation with them.
                Querex retrieves the relevant passages and answers with page-level
                citations — grounded, streamed, and traceable.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/chat"
                  className="rounded-xl bg-zinc-900 px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-zinc-900/25 transition hover:-translate-y-0.5 hover:bg-zinc-700 hover:shadow-xl"
                >
                  Open workspace
                </Link>
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-zinc-300 bg-white px-7 py-3.5 text-[15px] font-medium text-zinc-800 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md"
                >
                  View source
                </a>
              </div>
              <p className="mt-5 text-[12px] text-zinc-400">
                Free to use · sign in with Google, GitHub, or email
              </p>
            </Reveal>
          </div>

          {/* Right: the product with real depth — tilt + floating layers */}
          <Reveal delay={200}>
            <div className="relative flex justify-center lg:justify-end" style={{ perspective: "1100px" }}>
              {/* Floating capability card, behind-left */}
              <div
                className="animate-float-slower absolute -left-10 top-2 z-0 hidden rotate-[-6deg] rounded-xl border border-black/[0.05] bg-white px-3.5 py-2.5 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.18)] lg:block"
                aria-hidden
              >
                <div
                  className="flex items-center gap-1.5 text-[11px] font-medium"
                  style={{ color: "var(--marketing-accent-text)" }}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                  Streams in real time
                </div>
              </div>

              {/* Floating ingestion card, behind-right */}
              <div
                className="animate-float-slow absolute -right-14 bottom-6 z-0 hidden rotate-[5deg] rounded-xl border border-black/[0.05] bg-white px-3.5 py-2.5 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.18)] lg:block"
                aria-hidden
              >
                <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-500">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  Q3-Report.pdf indexed
                </div>
              </div>

              {/* The demo itself, tilting toward the cursor */}
              <Tilt3D className="relative z-10">
                <LiveDemoWidget />
              </Tilt3D>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Capability ribbon: the four pillars, stated with conviction ────── */}
      <section className="border-y border-black/[0.06] bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-black/[0.06] md:grid-cols-4">
          {[
            {
              label: "Grounded in your sources",
              sub: "Answers come from your files, not the model's memory.",
              icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
            },
            {
              label: "Page-level citations",
              sub: "Every claim links to the exact page it came from.",
              icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
            },
            {
              label: "Real-time streaming",
              sub: "Answers appear token by token — no waiting.",
              icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
            },
            {
              label: "Multi-document synthesis",
              sub: "Ask one question across many files at once.",
              icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2",
            },
          ].map((pillar, i) => (
            <Reveal key={pillar.label} delay={i * 60}>
              <div className="px-6 py-7">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={pillar.icon} />
                  </svg>
                </div>
                <p className="mt-3 text-[13.5px] font-semibold text-zinc-900">{pillar.label}</p>
                <p className="mt-1 text-[12px] leading-5 text-zinc-500">{pillar.sub}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Features: bento grid with hover lift ───────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-24 pt-24">
        <div className="grid gap-4 md:grid-cols-2">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 70} className={feature.span === "lg" ? "md:col-span-2" : ""}>
              <div className="group h-full rounded-2xl border border-black/[0.06] bg-white p-7 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_-14px_rgba(15,23,42,0.18)]">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
                >
                  {feature.icon}
                </div>
                <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-zinc-900">{feature.title}</h3>
                <p className="mt-2.5 text-[14px] leading-7 text-zinc-600">{feature.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Comparison: where Querex actually differs ──────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-28">
        <Reveal>
          <div className="text-center">
            <h2
              className="text-3xl font-normal tracking-tight text-zinc-900"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Not another AI chatbot
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-[14px] leading-7 text-zinc-500">
              Most tools either chat without proof, or read PDFs without memory. Querex
              is built to do both — grounded answers, kept in context.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-3" style={{ perspective: "1400px" }}>
          {[
            {
              name: "Generic AI chatbot",
              tagline: "General-purpose conversation",
              rows: [false, false, false, false, false],
              elevated: false,
            },
            {
              name: "Typical single-doc PDF tool",
              tagline: "Chat with one file at a time",
              rows: [true, false, false, false, false],
              elevated: false,
            },
            {
              name: "Querex",
              tagline: "Grounded research workspace",
              rows: [true, true, true, true, true],
              elevated: true,
            },
          ].map((col, i) => (
            <Reveal key={col.name} delay={i * 90}>
              <div
                className={[
                  "relative h-full rounded-2xl border p-7 transition-all duration-500",
                  col.elevated
                    ? "border-transparent bg-zinc-900 text-white shadow-[0_35px_70px_-20px_rgba(15,23,42,0.5)] md:-translate-y-3 md:scale-[1.04]"
                    : "border-black/[0.06] bg-white text-zinc-900 shadow-[0_2px_10px_rgba(15,23,42,0.04)]",
                ].join(" ")}
                style={
                  col.elevated
                    ? { transform: "translateZ(40px) rotateX(2deg)", transformStyle: "preserve-3d" }
                    : { transform: "translateZ(0)" }
                }
              >
                {col.elevated && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-900 shadow-md"
                    style={{ backgroundColor: "var(--marketing-accent)" }}
                  >
                    This is Querex
                  </span>
                )}

                <p className={`text-[15px] font-semibold ${col.elevated ? "text-white" : "text-zinc-900"}`}>
                  {col.name}
                </p>
                <p className={`mt-1 text-[12.5px] ${col.elevated ? "text-zinc-400" : "text-zinc-500"}`}>
                  {col.tagline}
                </p>

                <div className={`mt-6 space-y-3.5 border-t pt-6 ${col.elevated ? "border-white/10" : "border-black/[0.06]"}`}>
                  {[
                    "Page-level source citations",
                    "Real-time token streaming",
                    "Multi-document synthesis",
                    "Admin dashboard & audit log",
                    "Automatic retention controls",
                  ].map((label, ri) => (
                    <div key={label} className="flex items-center gap-2.5 text-[13px]">
                      {col.rows[ri] ? (
                        <span
                          className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: col.elevated ? "var(--marketing-accent)" : "var(--marketing-accent-soft)",
                            color: col.elevated ? "#1c1917" : "var(--marketing-accent-text)",
                          }}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      ) : (
                        <span className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full ${col.elevated ? "bg-white/10" : "bg-black/[0.04]"}`}>
                          <svg className={`h-2.5 w-2.5 ${col.elevated ? "text-zinc-500" : "text-zinc-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </span>
                      )}
                      <span className={col.elevated ? "text-zinc-200" : (col.rows[ri] ? "text-zinc-700" : "text-zinc-400")}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-28">
        <Reveal>
          <div className="rounded-3xl border border-black/[0.06] bg-white px-8 py-12 shadow-[0_2px_10px_rgba(15,23,42,0.04)] md:px-12">
            <h2
              className="text-center text-2xl font-normal tracking-tight text-zinc-900"
              style={{ fontFamily: "var(--font-display)" }}
            >
              How it works
            </h2>
            <div className="mt-10 grid gap-10 md:grid-cols-3">
              {WORKFLOW.map((item) => (
                <div key={item.step}>
                  <span className="font-mono text-[13px]" style={{ color: "var(--marketing-accent-text)" }}>
                    {item.step}
                  </span>
                  <h3 className="mt-2 text-[15px] font-semibold text-zinc-900">{item.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-6 text-zinc-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Built in the open: real, verifiable trust signals ──────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-28">
        <Reveal>
          <div className="rounded-3xl border border-black/[0.06] bg-white px-8 py-12 shadow-[0_2px_10px_rgba(15,23,42,0.04)] md:px-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
              >
                <svg className="h-4.5 w-4.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </div>
              <h2 className="text-2xl font-normal tracking-tight text-zinc-900" style={{ fontFamily: "var(--font-display)" }}>
                Built in the open
              </h2>
              <p className="max-w-md text-[14px] leading-7 text-zinc-500">
                No walled garden, no black box. The full source — retrieval pipeline,
                auth, admin panel, and all — is on GitHub for anyone to read, audit, or run themselves.
              </p>
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {[
                {
                  title: "Fully open source",
                  desc: "The complete codebase is public. Read every line, or self-host your own instance.",
                  icon: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
                },
                {
                  title: "Covered by automated tests",
                  desc: "Auth, retention, admin access, and RAG contracts run in CI on every change.",
                  icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
                },
                {
                  title: "Security-hardened by default",
                  desc: "httpOnly sessions, rate limiting, and brute-force protection — not bolted on later.",
                  icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
                },
              ].map((item) => (
                <div key={item.title} className="text-center sm:text-left">
                  <div
                    className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg sm:mx-0"
                    style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                  </div>
                  <p className="mt-3 text-[14px] font-semibold text-zinc-900">{item.title}</p>
                  <p className="mt-1.5 text-[13px] leading-6 text-zinc-500">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-9 flex justify-center">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-5 py-2.5 text-[13px] font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                View the source on GitHub
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Closing CTA ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-28">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-zinc-900 px-8 py-14 text-center shadow-[0_28px_60px_-18px_rgba(15,23,42,0.45)] md:px-12">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(500px 260px at 50% 0%, rgba(224,138,62,0.18), transparent 70%)",
              }}
              aria-hidden
            />
            <h2
              className="relative text-3xl font-normal tracking-tight text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Stop skimming. Start asking.
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-[14px] leading-7 text-zinc-400">
              Upload your first PDF and get a cited answer in under a minute.
            </p>
            <div className="relative mt-8">
              <Link
                href="/chat"
                className="inline-block rounded-xl bg-white px-8 py-3.5 text-[15px] font-semibold text-zinc-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-zinc-100"
              >
                Open workspace
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-black/[0.06] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-[13px] text-zinc-500 md:flex-row">
          <div className="flex items-center gap-2">
            <SparkIcon className="h-3.5 w-3.5" />
            <span>Querex — AI research workspace</span>
          </div>
          <div className="flex items-center gap-5">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-zinc-800"
            >
              GitHub
            </a>
            <Link href="/login" className="transition hover:text-zinc-800">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
