"use client";

import { Glare, Reveal, Tilt3D } from "@/features/shared/motion/motion";

const PILLARS = [
  {
    title: "Heuristic analysis",
    description:
      "Sentence-length rhythm, word-choice diversity, and known AI stock phrases — a pure, deterministic pass with no model call, always available even if the API is down.",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    ),
  },
  {
    title: "Semantic judgment",
    description:
      "A language model reads for voice, specificity, and idiosyncrasy — not just surface polish — and points to the exact sentences it finds most AI-like, verified against your actual text.",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    ),
  },
  {
    title: "Honest confidence",
    description:
      "Short text gets flagged low-confidence instead of a falsely precise number. Every result carries the same disclaimer we'd want to see: this is a strict estimate, never proof.",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
];

const FACTS = [
  "See exactly which sentences we flag — not just a bare percentage",
  "Advanced Scan breaks a document down paragraph by paragraph",
  "We say when we're not sure, instead of a falsely confident number",
  "No extra signup wall beyond the account you already have",
];

export function TrustSection() {
  return (
    <section className="space-y-6 pt-2">
      <Reveal>
        <div className="text-center">
          <h2 className="font-headline text-[22px] font-bold tracking-tight text-[var(--text-primary)]">
            Two independent signals. One honest verdict.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-[13.5px] leading-relaxed text-zinc-500">
            No detector is proof — ours or anyone else&rsquo;s. This is how we make a strict estimate worth trusting
            instead of a black-box percentage.
          </p>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PILLARS.map((pillar, i) => (
          <Reveal key={pillar.title} delay={i * 80}>
            <Tilt3D className="h-full">
              <Glare className="h-full">
              <div className="glass-card h-full rounded-2xl p-5">
                <div
                  className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
                >
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    {pillar.icon}
                  </svg>
                </div>
                <p className="text-[14px] font-semibold text-[var(--text-primary)]">{pillar.title}</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-500">{pillar.description}</p>
              </div>
              </Glare>
            </Tilt3D>
          </Reveal>
        ))}
      </div>

      <Reveal delay={240}>
        <div className="glass-card flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-2xl px-5 py-4">
          {FACTS.map((fact) => (
            <span key={fact} className="flex items-center gap-1.5 text-[12.5px] text-zinc-400">
              <svg
                className="h-3.5 w-3.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="var(--marketing-accent-text)"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              {fact}
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
