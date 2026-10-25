import Link from "next/link";

import { LandingFooter, LandingNav } from "@/features/landing/landing-chrome";
import { PRODUCTS } from "@/features/landing/products";
import { DemoMotionProvider } from "@/features/landing/demo-motion";
import { FounderNote } from "@/features/landing/founder-card";
import { HeroCta } from "@/features/landing/hero-cta";
import { HERO_SUBHEAD, SHOWS_ITS_WORK } from "@/features/landing/hero-content";
import { HeroPreview } from "@/features/landing/hero-preview";
import { LiveDemoWidget } from "@/features/landing/live-demo-widget";
import {
  AICheckerDemoWidget,
  HumanizerDemoWidget,
  PaperAnalyzerDemoWidget,
  RealtimeDemoWidget,
} from "@/features/landing/product-demo-widgets";
import { Reveal } from "@/features/shared/motion/motion";
import { SiteBackground } from "@/features/landing/site-background";
import { PageBackground } from "@/features/shared/components/page-background";


export default function LandingPage() {
  return (
    <DemoMotionProvider>
    <main className="marketing-light relative min-h-screen text-zinc-900">
      {/* Persistent 3D atmosphere — fixed, spans the entire scroll, not just the hero */}
      <PageBackground page="landing" dynamic={<SiteBackground />} />

      <div className="relative z-10">
      <LandingNav />

      {/* ── Hero: suite-level headline + a user-controlled preview of all five tools ── */}
      <section className="relative overflow-hidden">
        <div className="hero-grid-floor pointer-events-none absolute inset-x-[-10%] bottom-0 h-[65%]" aria-hidden />

        <div className="relative mx-auto grid grid-cols-1 max-w-7xl gap-14 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
          <div>
            <Reveal above>
              <div
                className="inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-[13px] shadow-sm"
                style={{ borderColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--marketing-accent)" }} />
                One account · 5 AI tools for research &amp; writing
              </div>
            </Reveal>

            <Reveal above delay={80}>
              <h1
                className="mt-7 text-5xl font-normal leading-[1.08] tracking-tight text-zinc-900 md:text-[3.75rem]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Five AI tools for
                <br />
                research and writing.
                <br />
                <span className="italic text-zinc-400">One account.</span>
              </h1>
            </Reveal>

            <Reveal above delay={160}>
              <p className="mt-7 max-w-lg text-[16px] leading-8 text-zinc-600">{HERO_SUBHEAD}</p>
            </Reveal>

            <Reveal above delay={240}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <HeroCta className="rounded-xl bg-zinc-900 px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-zinc-900/25 transition hover:-translate-y-0.5 hover:bg-zinc-700 hover:shadow-xl" />
                <a
                  href="#products"
                  className="rounded-xl border border-zinc-300 bg-white px-7 py-3.5 text-[15px] font-medium text-zinc-800 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md"
                >
                  See the five tools
                </a>
              </div>
              <p className="mt-5 text-[12px] text-zinc-400">
                Free to use · sign in with Google, GitHub, or email
              </p>
            </Reveal>
          </div>

          <Reveal above delay={200}>
            <HeroPreview />
          </Reveal>
        </div>
      </section>

      {/* ── Every tool shows its work: verifiable facts instead of invented social proof ── */}
      <section className="mx-auto max-w-7xl px-6 pb-4" aria-labelledby="shows-its-work">
        <Reveal>
          <div className="glass-card px-6 py-7 md:px-9">
            <h2 id="shows-its-work" className="text-center text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
              Every tool shows its work
            </h2>
            <ul className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
              {SHOWS_ITS_WORK.map((item) => {
                const product = PRODUCTS.find((p) => p.name === item.tool);
                return (
                  <li key={item.tool} className="flex items-start gap-2.5">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: product?.accent }}
                      aria-hidden
                    />
                    <div>
                      <p className="text-[13px] font-semibold text-zinc-900">{item.tool}</p>
                      <p className="mt-0.5 text-[12.5px] leading-5 text-zinc-600">{item.fact}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </Reveal>
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

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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

      {/* ── Research Copilot: mockup left, text right (same weight as the other four) ── */}
      <section className="relative mx-auto max-w-7xl overflow-hidden px-6 py-20">
        <div
          className="pointer-events-none absolute -inset-x-6 -inset-y-10 -z-10 rounded-[3rem] blur-3xl"
          style={{ background: `radial-gradient(55% 90% at 15% 50%, ${PRODUCTS[0].glow}, transparent 70%)` }}
          aria-hidden
        />
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          <Reveal className="order-2 md:order-1">
            <LiveDemoWidget />
          </Reveal>

          <Reveal delay={120} className="order-1 md:order-2">
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: PRODUCTS[0].accentText }}
              >
                Research Copilot
              </p>
              <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-zinc-900">
                Every answer, traceable to a page.
              </h2>
              <p className="mt-4 text-[14.5px] leading-7 text-zinc-600">
                Upload research papers and reports, then ask questions in plain language.
                Answers stream back with page-level citations you can check against the
                source, from one document or several at once.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Answers grounded in the documents you select",
                  "Page-level citations, with a built-in viewer that jumps to the page",
                  "One-click actions: Summarize, Key findings, Compare, References, Study questions",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-[13.5px] text-zinc-700">
                    <span
                      className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: PRODUCTS[0].accentSoft, color: PRODUCTS[0].accentText }}
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
                href="/chat"
                className="mt-7 inline-block rounded-xl px-6 py-3 text-[14px] font-semibold text-white shadow-md transition hover:-translate-y-0.5"
                style={{ backgroundColor: PRODUCTS[0].accent, boxShadow: `0 10px 25px -8px ${PRODUCTS[0].glow}` }}
              >
                Try Research Copilot
              </Link>
            </div>
          </Reveal>
        </div>
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
                  "Two engines: Basic, a prompt-engineered pipeline, and Ultra, a purpose-trained model (rolling out)",
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

      {/* ── Founder note: renders nothing unless the founder has published it (Settings → Founder) ── */}
      <FounderNote />

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
              <HeroCta className="inline-block rounded-xl bg-white px-8 py-3.5 text-[15px] font-semibold text-zinc-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-zinc-100" />
            </div>
          </div>
        </Reveal>
      </section>

      <LandingFooter />
      </div>
    </main>
    </DemoMotionProvider>
  );
}
