"use client";

import Link from "next/link";

import { LandingFooter, LandingNav } from "@/features/landing/landing-chrome";
import { LiveDemoWidget } from "@/features/landing/live-demo-widget";
import { AICheckerDemoWidget, HumanizerDemoWidget } from "@/features/landing/product-demo-widgets";
import { PRODUCTS, type Product } from "@/features/landing/products";
import { SiteBackground } from "@/features/landing/site-background";
import { TOOL_PAGES, type ToolSlug } from "@/features/landing/tool-pages";
import { PageBackground } from "@/features/shared/components/page-background";
import { Reveal, Tilt3D } from "@/features/shared/motion/motion";

const DEMOS: Record<ToolSlug, () => React.JSX.Element> = {
  chat: LiveDemoWidget,
  humanizer: HumanizerDemoWidget,
  checker: AICheckerDemoWidget,
};

function Check({ product }: { product: Product }) {
  return (
    <span
      className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: product.accentSoft, color: product.accentText }}
    >
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

/**
 * What a signed-out visitor (and a crawler) sees at a tool's URL instead of being redirected to /login.
 * It reuses the homepage's own building blocks (nav, footer, live demo widgets, glass cards, accent
 * colours) so the tool pages look like the rest of the site. Copy lives in tool-pages.ts; every claim
 * there must match what the tool really does, and the example is a real run.
 */
export function ToolLanding({ tool }: { tool: ToolSlug }) {
  const page = TOOL_PAGES[tool];
  const product = PRODUCTS.find((p) => p.name === page.name) ?? PRODUCTS[0];
  const Demo = DEMOS[tool];
  const others = PRODUCTS.filter((p) => p.name !== page.name);

  return (
    <main className="marketing-light relative min-h-screen text-zinc-900">
      <PageBackground page="landing" dynamic={<SiteBackground />} />

      <div className="relative z-10">
        <LandingNav active={page.name} />

        {/* ── Hero: headline + live preview ─────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="hero-grid-floor pointer-events-none absolute inset-x-[-10%] bottom-0 h-[65%]" aria-hidden />

          <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-14 px-6 pb-24 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-20">
            <div>
              <Reveal>
                <div
                  className="inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-[13px] shadow-sm"
                  style={{ borderColor: product.accentSoft, color: product.accentText }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: product.accent }} />
                  {page.name} · one of 5 Querex tools
                </div>
              </Reveal>

              <Reveal delay={80}>
                <h1
                  className="mt-7 text-5xl font-normal leading-[1.08] tracking-tight text-zinc-900 md:text-[3.5rem]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {page.headline.lead}
                  <br />
                  <span className="italic text-zinc-400">{page.headline.emphasis}</span>
                </h1>
              </Reveal>

              <Reveal delay={160}>
                <p className="mt-7 max-w-lg text-[16px] leading-8 text-zinc-600">{page.intro}</p>
              </Reveal>

              <Reveal delay={240}>
                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <Link
                    href="/login"
                    className="rounded-xl bg-zinc-900 px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-zinc-900/25 transition hover:-translate-y-0.5 hover:bg-zinc-700 hover:shadow-xl"
                  >
                    Sign in to use {page.name}
                  </Link>
                  <a
                    href="#how-it-works"
                    className="rounded-xl border border-zinc-300 bg-white px-7 py-3.5 text-[15px] font-medium text-zinc-800 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md"
                  >
                    See how it works
                  </a>
                </div>
                <p className="mt-5 text-[12px] text-zinc-400">Free to use · sign in with Google, GitHub, or email</p>
              </Reveal>
            </div>

            <Reveal delay={200}>
              <div className="relative flex justify-center lg:justify-end" style={{ perspective: "1100px" }}>
                <div
                  className="glass-card animate-float-slower absolute -left-10 top-2 z-0 hidden rotate-[-6deg] px-3.5 py-2.5 lg:block"
                  aria-hidden
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: product.accentText }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: product.accent }} />
                    {page.chips[0]}
                  </div>
                </div>
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
                    {page.chips[1]}
                  </div>
                </div>

                <Tilt3D className="relative z-10 w-full max-w-[440px]">
                  <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:text-right">
                    {page.name}, live preview
                  </p>
                  <Demo />
                </Tilt3D>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-24 px-6 pb-8 pt-8" aria-labelledby="how-heading">
          <Reveal>
            <div className="text-center">
              <h2 id="how-heading" className="font-headline text-3xl font-bold tracking-tight text-zinc-900">
                How it works
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-[14px] leading-7 text-zinc-500">
                Three steps from a blank page to a result you can check.
              </p>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {page.steps.map((step, i) => (
              <Reveal key={step.title} delay={i * 80}>
                <div className="glass-card relative h-full overflow-hidden p-6">
                  <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: product.accent }} aria-hidden />
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-[14px] font-bold"
                    style={{ backgroundColor: product.accentSoft, color: product.accentText }}
                  >
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-[15.5px] font-semibold tracking-tight text-zinc-900">{step.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-6 text-zinc-600">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Features + a real example ────────────────────────────────────── */}
        <section className="relative mx-auto max-w-7xl overflow-hidden px-6 py-20" aria-labelledby="feature-heading">
          <div
            className="pointer-events-none absolute -inset-x-6 -inset-y-10 -z-10 rounded-[3rem] blur-3xl"
            style={{ background: `radial-gradient(55% 90% at 85% 50%, ${product.glow}, transparent 70%)` }}
            aria-hidden
          />
          <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
            <Reveal>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: product.accentText }}>
                  {page.name}
                </p>
                <h2 id="feature-heading" className="mt-2 font-headline text-3xl font-bold tracking-tight text-zinc-900">
                  {page.features.title}
                </h2>
                <p className="mt-4 text-[14.5px] leading-7 text-zinc-600">{page.features.body}</p>
                <ul className="mt-6 space-y-3">
                  {page.features.bullets.map((line) => (
                    <li key={line} className="flex items-start gap-2.5 text-[13.5px] text-zinc-700">
                      <Check product={product} />
                      {line}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className="mt-7 inline-block rounded-xl px-6 py-3 text-[14px] font-semibold text-white shadow-md transition hover:-translate-y-0.5"
                  style={{ backgroundColor: product.accent, boxShadow: `0 10px 25px -8px ${product.glow}` }}
                >
                  Try {page.name}
                </Link>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <figure className="glass-card relative overflow-hidden p-6">
                <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: product.accent }} aria-hidden />
                <figcaption className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: product.accentText }}>
                  {page.example.label}
                </figcaption>
                <div className="mt-4 space-y-3">
                  {page.example.items.map((item) => (
                    <div key={item.heading} className="rounded-xl border border-zinc-200/80 bg-white/80 p-4">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{item.heading}</h3>
                      <p className="mt-1.5 text-[13.5px] leading-6 text-zinc-800">{item.body}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[12.5px] leading-5 text-zinc-500">{page.example.note}</p>
              </figure>
            </Reveal>
          </div>
        </section>

        {/* ── Good to know + FAQ ───────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-6 pb-20" aria-labelledby="know-heading">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal>
              <div className="glass-card relative h-full overflow-hidden p-7">
                <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: product.accent }} aria-hidden />
                <h2 id="know-heading" className="font-headline text-xl font-bold tracking-tight text-zinc-900">
                  Good to know
                </h2>
                <ul className="mt-5 space-y-3.5">
                  {page.goodToKnow.map((line) => (
                    <li key={line} className="flex items-start gap-2.5 text-[13.5px] leading-6 text-zinc-700">
                      <span
                        className="mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{ backgroundColor: product.accentSoft, color: product.accentText }}
                        aria-hidden
                      >
                        i
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className="glass-card h-full divide-y divide-zinc-200/70 overflow-hidden">
                <h2 className="px-7 pb-4 pt-7 font-headline text-xl font-bold tracking-tight text-zinc-900">Questions</h2>
                {page.faq.map((item, i) => (
                  <details key={item.q} className="group px-7 py-4" open={i === 0}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-semibold text-zinc-900">
                      {item.q}
                      <svg
                        className="h-4 w-4 shrink-0 text-zinc-400 transition group-open:rotate-180"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <p className="mt-2.5 text-[13.5px] leading-6 text-zinc-600">{item.a}</p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Closing call to action ───────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-6 pb-20">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-zinc-900/75 px-8 py-14 text-center shadow-[0_28px_60px_-18px_rgba(15,23,42,0.45)] backdrop-blur-sm md:px-12">
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: `radial-gradient(500px 260px at 50% 0%, ${product.glow}, transparent 70%)` }}
                aria-hidden
              />
              <h2 className="font-headline relative text-3xl font-bold tracking-tight text-white">{page.cta.title}</h2>
              <p className="relative mx-auto mt-3 max-w-md text-[14px] leading-7 text-zinc-300">{page.cta.body}</p>
              <div className="relative mt-8">
                <Link
                  href="/login"
                  className="inline-block rounded-xl bg-white px-8 py-3.5 text-[15px] font-semibold text-zinc-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-zinc-100"
                >
                  Sign in to use {page.name}
                </Link>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── The rest of the suite ────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-6 pb-24" aria-labelledby="more-heading">
          <Reveal>
            <div className="text-center">
              <h2 id="more-heading" className="font-headline text-2xl font-bold tracking-tight text-zinc-900">
                More from Querex
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-[13.5px] leading-6 text-zinc-500">
                Five tools, one account.
              </p>
            </div>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {others.map((p, i) => (
              <Reveal key={p.name} delay={i * 70}>
                <Link href={p.href} className="block h-full">
                  <div className="glass-card group relative h-full overflow-hidden p-6 transition-all duration-300 hover:-translate-y-1">
                    <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: p.accent }} aria-hidden />
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                      style={{ backgroundColor: p.accentSoft, color: p.accentText }}
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={p.icon} />
                      </svg>
                    </div>
                    <h3 className="mt-5 text-[15.5px] font-semibold tracking-tight text-zinc-900">{p.name}</h3>
                    <p className="mt-2 text-[13px] leading-6 text-zinc-600">{p.tagline}</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        <LandingFooter />
      </div>
    </main>
  );
}
