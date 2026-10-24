"use client";

import Link from "next/link";

import { BrandMark } from "@/features/shared/components/brand-mark";
import { PageBackground } from "@/features/shared/components/page-background";
import { SiteBackground } from "@/features/landing/site-background";
import { TOOL_PAGES, type ToolSlug } from "@/features/landing/tool-pages";

/**
 * What a signed-out visitor (and a crawler) sees at a tool's URL instead of being redirected to
 * /login. Plain semantic HTML on purpose: one h1, headings, a list, <details> for the FAQ.
 */
export function ToolLanding({ tool }: { tool: ToolSlug }) {
  const page = TOOL_PAGES[tool];
  const others = Object.values(TOOL_PAGES).filter((p) => p.slug !== tool);

  return (
    <main className="marketing-light relative min-h-screen text-zinc-900">
      <PageBackground page="landing" dynamic={<SiteBackground />} />

      <div className="relative z-10">
        <nav className="glass-bar sticky top-0 z-40 border-b">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2.5">
              <BrandMark />
              <span className="font-headline text-[15px] font-bold tracking-tight">Querex</span>
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-zinc-700"
            >
              Sign in
            </Link>
          </div>
        </nav>

        <article className="mx-auto max-w-4xl px-6 py-14">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{page.name}</p>
          <h1 className="font-headline mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-5xl">
            {page.h1}
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-7 text-zinc-600">{page.intro}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="rounded-full bg-zinc-900 px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-zinc-700"
            >
              Sign in to use {page.name}
            </Link>
            <span className="text-[13px] text-zinc-500">Free to use. Sign in with Google, GitHub or email.</span>
          </div>

          <section className="mt-16" aria-labelledby="how-it-works">
            <h2 id="how-it-works" className="font-headline text-2xl font-bold tracking-tight">
              How it works
            </h2>
            <ol className="mt-6 grid gap-4 sm:grid-cols-3">
              {page.steps.map((step, i) => (
                <li key={step.title} className="rounded-2xl border border-zinc-200 bg-white/70 p-5">
                  <span className="text-[12px] font-semibold text-zinc-400">Step {i + 1}</span>
                  <h3 className="mt-1 text-[15px] font-semibold text-zinc-900">{step.title}</h3>
                  <p className="mt-2 text-[14px] leading-6 text-zinc-600">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-16" aria-labelledby="example">
            <h2 id="example" className="font-headline text-2xl font-bold tracking-tight">
              {page.example.label}
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {page.example.items.map((item) => (
                <div key={item.heading} className="rounded-2xl border border-zinc-200 bg-white/70 p-5">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">{item.heading}</h3>
                  <p className="mt-2 text-[14.5px] leading-7 text-zinc-800">{item.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-zinc-500">{page.example.note}</p>
          </section>

          <section className="mt-16" aria-labelledby="good-to-know">
            <h2 id="good-to-know" className="font-headline text-2xl font-bold tracking-tight">
              Good to know
            </h2>
            <ul className="mt-5 list-disc space-y-2 pl-5 text-[14.5px] leading-7 text-zinc-600">
              {page.goodToKnow.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="mt-16" aria-labelledby="faq">
            <h2 id="faq" className="font-headline text-2xl font-bold tracking-tight">
              Questions
            </h2>
            <div className="mt-5 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white/70">
              {page.faq.map((item) => (
                <details key={item.q} className="group px-5 py-4" open>
                  <summary className="cursor-pointer list-none text-[15px] font-semibold text-zinc-900">
                    {item.q}
                  </summary>
                  <p className="mt-2 text-[14.5px] leading-7 text-zinc-600">{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="mt-16 rounded-2xl border border-zinc-200 bg-white/70 p-6">
            <h2 className="font-headline text-xl font-bold tracking-tight">More from Querex</h2>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link href={o.path} className="font-medium text-zinc-900 underline underline-offset-4">
                    {o.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/" className="font-medium text-zinc-900 underline underline-offset-4">
                  All tools
                </Link>
              </li>
            </ul>
          </section>

          <footer className="mt-12 flex gap-5 text-[13px] text-zinc-500">
            <Link href="/privacy" className="hover:text-zinc-900">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-zinc-900">
              Terms
            </Link>
          </footer>
        </article>
      </div>
    </main>
  );
}
