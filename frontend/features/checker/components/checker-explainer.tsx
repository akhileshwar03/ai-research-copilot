"use client";

import Link from "next/link";

import { CheckerExampleCard, CheckerStory } from "@/features/landing/checker-story";
import { PRODUCTS } from "@/features/landing/products";
import { TOOL_PAGES } from "@/features/landing/tool-pages";
import { AboutChecker } from "./about-checker";

const page = TOOL_PAGES.checker;
const product = PRODUCTS.find((p) => p.name === page.name) ?? PRODUCTS[0];

/** Everything below the tool: how it works, a real example, the limits, the questions. Shown to everyone, so a
 *  visitor and a signed-in user read the same page. */
export function CheckerExplainer({ signedIn }: { signedIn: boolean }) {
  const others = PRODUCTS.filter((p) => p.name !== page.name);
  return (
    <div className="space-y-14 pt-10 md:space-y-20 md:pt-14">
      <CheckerStory />

      <section aria-labelledby="checker-features" className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
        <div>
          <h2 id="checker-features" className="font-headline text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            {page.features.title}
          </h2>
          <p className="mt-4 text-[14.5px] leading-7 text-[var(--text-primary)] opacity-75">{page.features.body}</p>
          <ul className="mt-6 space-y-3">
            {page.features.bullets.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[14px] text-[var(--text-primary)]">
                <span aria-hidden className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: product.accentSoft, color: product.accentText }}>
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <CheckerExampleCard label={page.example.label} note={page.example.note} accent={product.accent} />
      </section>

      <AboutChecker />

      <section aria-labelledby="checker-faq" className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 id="checker-faq" className="font-headline text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Questions
          </h2>
          <p className="mt-2 max-w-xs text-[13.5px] leading-6 text-[var(--text-primary)] opacity-70">The things people ask before they trust a detector.</p>
        </div>
        <div className="glass-card divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl">
          {page.faq.map((item) => (
            <details key={item.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-semibold text-[var(--text-primary)]">
                {item.q}
                <svg className="h-4 w-4 shrink-0 opacity-60 transition group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <p className="mt-2.5 text-[13.5px] leading-6 text-[var(--text-primary)] opacity-75">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {!signedIn && (
        <>
          <section className="relative overflow-hidden rounded-3xl bg-zinc-900/85 px-8 py-12 text-center md:px-12">
            <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(500px 260px at 50% 0%, ${product.glow}, transparent 70%)` }} aria-hidden />
            <h2 className="relative font-headline text-3xl font-bold tracking-tight text-white">{page.cta.title}</h2>
            <p className="relative mx-auto mt-3 max-w-md text-[14px] leading-7" style={{ color: "rgba(255,255,255,0.78)" }}>{page.cta.body}</p>
            <div className="relative mt-7">
              <a href="#checker-tool" className="inline-block rounded-xl bg-white px-8 py-3.5 text-[15px] font-semibold text-zinc-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-zinc-100">
                Check some text
              </a>
            </div>
          </section>

          <section aria-labelledby="checker-more">
            <h2 id="checker-more" className="font-headline text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              More from Querex
            </h2>
            <p className="mt-2 text-[13.5px] text-[var(--text-primary)] opacity-70">Five tools, one account.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {others.map((p) => (
                <Link key={p.name} href={p.href} className="glass-card group relative block overflow-hidden rounded-xl p-5 transition-transform duration-300 hover:-translate-y-1">
                  <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: p.accent }} aria-hidden />
                  <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{p.name}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--text-primary)] opacity-70">{p.tagline}</p>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
