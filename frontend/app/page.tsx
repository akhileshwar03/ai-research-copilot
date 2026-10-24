import Link from "next/link";

import { LandingFooter, LandingNav } from "@/features/landing/landing-chrome";
import { PRODUCTS } from "@/features/landing/products";
import { LiveDemoWidget } from "@/features/landing/live-demo-widget";
import {
  AICheckerDemoWidget,
  HumanizerDemoWidget,
  PaperAnalyzerDemoWidget,
  RealtimeDemoWidget,
} from "@/features/landing/product-demo-widgets";
import { Reveal, Tilt3D } from "@/features/shared/motion/motion";
import { SiteBackground } from "@/features/landing/site-background";
import { PageBackground } from "@/features/shared/components/page-background";


export default function LandingPage() {
  return (
    <main className="marketing-light relative min-h-screen text-zinc-900">
      {/* Persistent 3D atmosphere — fixed, spans the entire scroll, not just the hero */}
      <PageBackground page="landing" dynamic={<SiteBackground />} />

      <div className="relative z-10">
      <LandingNav />

      {/* ── Hero: asymmetric split with 3D demo ────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Perspective floor — the ground the demo card sits on; the rest of
            the page's depth (grid texture, orbs, particles) is SiteBackground,
            fixed behind the whole scroll. */}
        <div className="hero-grid-floor pointer-events-none absolute inset-x-[-10%] bottom-0 h-[65%]" aria-hidden />

        <div className="relative mx-auto grid grid-cols-1 max-w-7xl gap-14 px-6 pb-28 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
          {/* Left: headline + CTA */}
          <div>
            <Reveal>
              <div
                className="inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-[13px] shadow-sm"
                style={{ borderColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--marketing-accent)" }} />
                One account · 5 AI tools for research &amp; writing
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
                citations — grounded, streamed, and traceable. It&apos;s also home to a
                Humanizer, an AI Checker, Real-time web search, and a Paper Analyzer, all
                under one login.
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
                  href="#products"
                  className="rounded-xl border border-zinc-300 bg-white px-7 py-3.5 text-[15px] font-medium text-zinc-800 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md"
                >
                  See all 5 tools
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
                className="glass-card animate-float-slower absolute -left-10 top-2 z-0 hidden rotate-[-6deg] px-3.5 py-2.5 lg:block"
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

              {/* Floating ingestion card, below-right — the column has zero
                  slack on the right (flush via justify-end), so this sits
                  below the card's bottom edge instead of beside it. */}
              <div
                className="glass-card animate-float-slow absolute -bottom-12 right-6 z-20 hidden rotate-[5deg] px-3.5 py-2.5 lg:block"
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
              <Tilt3D className="relative z-10 w-full max-w-[440px]">
                <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:text-right">
                  Research Copilot, live preview
                </p>
                <LiveDemoWidget />
              </Tilt3D>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Products: the whole suite, front and center ──────────────────────── */}
      <section id="products" className="mx-auto max-w-7xl px-6 pb-20 pt-20">
        <Reveal>
          <div className="text-center">
            <h2 className="font-headline text-3xl font-bold tracking-tight text-zinc-900">
              Five tools. One account.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-[14px] leading-7 text-zinc-500">
              Querex started as a document copilot. It&apos;s now a small suite of
              research and writing tools, each free to use the moment you sign in.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCTS.map((product, i) => {
            const available = Boolean(product.href);
            const card = (
              <div
                className={[
                  "glass-card group relative h-full overflow-hidden p-6 transition-all duration-300",
                  available ? "hover:-translate-y-1" : "opacity-60",
                ].join(" ")}
              >
                <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: product.accent }} aria-hidden />
                <div className="flex items-start justify-between">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundColor: product.accentSoft, color: product.accentText }}
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={product.icon} />
                    </svg>
                  </div>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                      available ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500",
                    ].join(" ")}
                  >
                    {product.status}
                  </span>
                </div>
                <h3 className="mt-5 text-[15.5px] font-semibold tracking-tight text-zinc-900">{product.name}</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-600">{product.tagline}</p>
              </div>
            );

            return (
              <Reveal key={product.name} delay={i * 70}>
                {product.href ? (
                  <Link href={product.href} className="block h-full">
                    {card}
                  </Link>
                ) : (
                  card
                )}
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ── Research Copilot recap: compact, since the hero already proved it ── */}
      <section className="relative mx-auto max-w-7xl overflow-hidden px-6 pb-4 pt-16">
        <div
          className="pointer-events-none absolute -inset-x-6 -inset-y-4 -z-10 rounded-[2.5rem] blur-3xl"
          style={{ background: `radial-gradient(60% 100% at 15% 50%, ${PRODUCTS[0].glow}, transparent 70%)` }}
          aria-hidden
        />
        <Reveal>
          <div className="glass-card relative overflow-hidden px-8 py-10 md:px-12">
            <div className="absolute inset-y-0 left-0 hidden w-1.5 md:block" style={{ backgroundColor: PRODUCTS[0].accent }} aria-hidden />
            <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
              <div className="max-w-md">
                <p
                  className="text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: PRODUCTS[0].accentText }}
                >
                  The flagship tool
                </p>
                <h2 className="mt-2 font-headline text-2xl font-bold tracking-tight text-zinc-900">
                  Research Copilot
                </h2>
                <p className="mt-3 text-[14px] leading-7 text-zinc-500">
                  The original Querex product, and still the most capable — upload,
                  ask, and every answer streams back with a page citation you can check.
                </p>
                <Link
                  href="/chat"
                  className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold"
                  style={{ color: PRODUCTS[0].accentText }}
                >
                  Open Research Copilot
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4 md:max-w-md">
                {[
                  { label: "Grounded in your sources", icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
                  { label: "Page-level citations", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
                  { label: "Real-time streaming", icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" },
                  { label: "Multi-document synthesis", icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" },
                ].map((pillar) => (
                  <div key={pillar.label} className="flex items-start gap-2.5">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: PRODUCTS[0].accentSoft, color: PRODUCTS[0].accentText }}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={pillar.icon} />
                      </svg>
                    </div>
                    <p className="text-[12.5px] font-medium leading-5 text-zinc-700">{pillar.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Humanizer: text left, mockup right ───────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl overflow-hidden px-6 py-20">
        <div
          className="pointer-events-none absolute -inset-x-6 -inset-y-10 -z-10 rounded-[3rem] blur-3xl"
          style={{ background: `radial-gradient(55% 90% at 85% 50%, ${PRODUCTS[1].glow}, transparent 70%)` }}
          aria-hidden
        />
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          <Reveal>
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: PRODUCTS[1].accentText }}
              >
                Humanizer
              </p>
              <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-zinc-900">
                Sound human. Stay accurate.
              </h2>
              <p className="mt-4 text-[14.5px] leading-7 text-zinc-600">
                Rewrite AI-sounding text so it reads naturally, with meaning and facts
                preserved. Built to make writing genuinely better, not to trick a
                detector — no invisible characters, no gimmicks, just better editing.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Natural, direct rewrites — built for blog posts, social copy, and product writing",
                  "Word-diff transparency — see exactly which words changed",
                  "Streams live, token by token, no waiting for the full rewrite",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-[13.5px] text-zinc-700">
                    <span
                      className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: PRODUCTS[1].accentSoft, color: PRODUCTS[1].accentText }}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/humanizer"
                className="mt-7 inline-block rounded-xl px-6 py-3 text-[14px] font-semibold text-white shadow-md transition hover:-translate-y-0.5"
                style={{ backgroundColor: PRODUCTS[1].accent, boxShadow: `0 10px 25px -8px ${PRODUCTS[1].glow}` }}
              >
                Try Humanizer
              </Link>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <HumanizerDemoWidget />
          </Reveal>
        </div>
      </section>

      {/* ── AI Checker: mockup left, text right ──────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl overflow-hidden px-6 py-20">
        <div
          className="pointer-events-none absolute -inset-x-6 -inset-y-10 -z-10 rounded-[3rem] blur-3xl"
          style={{ background: `radial-gradient(55% 90% at 15% 50%, ${PRODUCTS[2].glow}, transparent 70%)` }}
          aria-hidden
        />
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          <Reveal className="order-2 md:order-1">
            <AICheckerDemoWidget />
          </Reveal>

          <Reveal delay={120} className="order-1 md:order-2">
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: PRODUCTS[2].accentText }}
              >
                AI Checker
              </p>
              <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-zinc-900">
                Decisive answers, not hedging.
              </h2>
              <p className="mt-4 text-[14.5px] leading-7 text-zinc-600">
                Detect AI-generated text with sentence-level highlighting and a
                paragraph-by-paragraph breakdown — plus a free grammar and style pass
                bundled in. Every result carries an honest disclaimer, not false certainty.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Sentence-level highlighting of the exact flagged text",
                  "Advanced Scan — a paragraph-by-paragraph AI-probability breakdown",
                  "Free Writing Feedback — grammar, spelling, and clarity issues",
                  "States its own false-positive risk instead of overclaiming",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-[13.5px] text-zinc-700">
                    <span
                      className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: PRODUCTS[2].accentSoft, color: PRODUCTS[2].accentText }}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/checker"
                className="mt-7 inline-block rounded-xl px-6 py-3 text-[14px] font-semibold text-white shadow-md transition hover:-translate-y-0.5"
                style={{ backgroundColor: PRODUCTS[2].accent, boxShadow: `0 10px 25px -8px ${PRODUCTS[2].glow}` }}
              >
                Try AI Checker
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Real-time AI: text left, mockup right ────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl overflow-hidden px-6 py-20">
        <div
          className="pointer-events-none absolute -inset-x-6 -inset-y-10 -z-10 rounded-[3rem] blur-3xl"
          style={{ background: `radial-gradient(55% 90% at 85% 50%, ${PRODUCTS[3].glow}, transparent 70%)` }}
          aria-hidden
        />
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          <Reveal>
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: PRODUCTS[3].accentText }}
              >
                Real-time AI
              </p>
              <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-zinc-900">
                Current answers, always cited.
              </h2>
              <p className="mt-4 text-[14.5px] leading-7 text-zinc-600">
                General chat grounded in live web search — every answer links back to a
                real, clickable source. Search results are treated strictly as data to
                cite, never as instructions to follow.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Live web search on every question, not just training data",
                  "Numbered, clickable citations for every claim",
                  "Independent session history, separate from Research Copilot",
                  "Search results can't hijack the model — they're data, not commands",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-[13.5px] text-zinc-700">
                    <span
                      className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: PRODUCTS[3].accentSoft, color: PRODUCTS[3].accentText }}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/realtime"
                className="mt-7 inline-block rounded-xl px-6 py-3 text-[14px] font-semibold text-white shadow-md transition hover:-translate-y-0.5"
                style={{ backgroundColor: PRODUCTS[3].accent, boxShadow: `0 10px 25px -8px ${PRODUCTS[3].glow}` }}
              >
                Try Real-time AI
              </Link>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <RealtimeDemoWidget />
          </Reveal>
        </div>
      </section>

      {/* ── Paper Analyzer: mockup left, text right ──────────────────────────── */}
      <section className="relative mx-auto max-w-7xl overflow-hidden px-6 py-20">
        <div
          className="pointer-events-none absolute -inset-x-6 -inset-y-10 -z-10 rounded-[3rem] blur-3xl"
          style={{ background: `radial-gradient(55% 90% at 15% 50%, ${PRODUCTS[4].glow}, transparent 70%)` }}
          aria-hidden
        />
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          <Reveal className="order-2 md:order-1">
            <PaperAnalyzerDemoWidget />
          </Reveal>

          <Reveal delay={120} className="order-1 md:order-2">
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: PRODUCTS[4].accentText }}
              >
                Paper Analyzer
              </p>
              <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-zinc-900">
                Formatting, actually measured.
              </h2>
              <p className="mt-4 text-[14.5px] leading-7 text-zinc-600">
                Upload a research paper and pick a style guide — APA, MLA, or IEEE. Every
                check is computed directly from the PDF&apos;s real margins, spacing, font,
                and alignment, never guessed by a model looking at a description.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Checks against APA, MLA, or IEEE — chosen before you upload",
                  "Margins, line spacing, font, alignment, and page numbering",
                  "Measured from real page geometry, not an LLM's best guess",
                  "Every check shows the measured value next to what's expected",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-[13.5px] text-zinc-700">
                    <span
                      className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: PRODUCTS[4].accentSoft, color: PRODUCTS[4].accentText }}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/paper-analyzer"
                className="mt-7 inline-block rounded-xl px-6 py-3 text-[14px] font-semibold text-white shadow-md transition hover:-translate-y-0.5"
                style={{ backgroundColor: PRODUCTS[4].accent, boxShadow: `0 10px 25px -8px ${PRODUCTS[4].glow}` }}
              >
                Try Paper Analyzer
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Closing CTA ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-28">
        <Reveal>
          {/* 2026-09-20: was a fully opaque bg-zinc-900 -- a flat black block
              regardless of what the admin set the page background to (the
              dynamic scene, or an uploaded image), which read as hardcoded
              and disconnected from the rest of the page. Translucent instead,
              so whatever's actually behind the page shows through here too;
              still dark enough (75% opacity) that the white heading/body text
              stays comfortably legible over either background. */}
          <div className="relative overflow-hidden rounded-3xl bg-zinc-900/75 px-8 py-14 text-center shadow-[0_28px_60px_-18px_rgba(15,23,42,0.45)] backdrop-blur-sm md:px-12">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(500px 260px at 50% 0%, rgba(197,105,31,0.22), transparent 70%)",
              }}
              aria-hidden
            />
            <h2 className="font-headline relative text-3xl font-bold tracking-tight text-white">
              Stop guessing. Start verifying.
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-[14px] leading-7 text-zinc-400">
              Ask your documents, rewrite AI-sounding text, detect AI content, search the
              live web, or check a paper&apos;s formatting — pick a tool and get your first
              result in under a minute.
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

      <LandingFooter />
      </div>
    </main>
  );
}
