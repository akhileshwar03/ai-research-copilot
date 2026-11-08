/** What the checker can and can't do, in plain words. The figures come from our own evaluation on several
 *  thousand held-out texts at the strict verdict setting. Update them whenever the model changes. */
export const EXPECTATIONS = [
  { what: "Text written by AI models such as ChatGPT, Claude and Gemini", result: "Caught about 85–99% of the time", lo: 85, hi: 99, kind: "caught" as const, hard: false },
  { what: "AI text rewritten by other humanizer tools", result: "Caught about 65–90% of the time", lo: 65, hi: 90, kind: "caught" as const, hard: false },
  { what: "Real human writing", result: "Wrongly flagged about 0–4% of the time", lo: 0, hi: 4, kind: "flagged" as const, hard: false },
  { what: "AI text edited by a person, or rewritten to sound human", result: "Often missed: caught about 25–60% of the time", lo: 25, hi: 60, kind: "caught" as const, hard: true },
];

const NOTES = [
  { title: "Your text stays private", body: "It is sent over an encrypted connection to our own checker, scored, and not saved." },
  { title: "Built for English", body: "The checker is built and tested for English text only. Other languages are not supported." },
  { title: "Edited AI text is harder", body: "AI text that a person has edited, or that a humanizer tool has rewritten to sound human, is caught less reliably: about 25\u201360% in our tests." },
  { title: "A guide, not a verdict", body: "A detector can be wrong in both directions. Never use a result on its own to accuse or penalise anyone." },
];

export function AboutChecker() {
  return (
    <section aria-labelledby="about-title" className="glass-card rounded-xl p-6 md:p-8">
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
        <div>
          <h2 id="about-title" className="font-headline text-[19px] font-bold text-[var(--text-primary)]">
            What this checker can and can&rsquo;t do
          </h2>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-zinc-400">
            No AI detector is certain, ours included. These figures come from our own tests on several thousand texts, so you can judge a result for yourself.
          </p>

          <ul className="mt-6 divide-y divide-[var(--border-subtle)]">
            {EXPECTATIONS.filter((row) => !row.hard).map((row) => {
              const flagged = row.kind === "flagged";
              return (
                <li key={row.what} className="py-4 first:pt-0">
                  <div className="flex items-baseline justify-between gap-6">
                    <p className="text-[14px] leading-snug text-[var(--text-primary)]">{row.what}</p>
                    <p className="shrink-0 text-right">
                      <span className="font-headline text-[20px] font-bold leading-none text-[var(--text-primary)]">
                        {flagged ? `${row.hi}% or less` : `Up to ${row.hi}%`}
                      </span>
                      <span className="mt-1 block text-[11.5px] text-zinc-400">
                        {flagged ? "wrongly flagged" : "caught"} &middot; {row.lo}&ndash;{row.hi}% in our tests
                      </span>
                    </p>
                  </div>
                  <div aria-hidden className="relative mt-3 h-1 rounded-full bg-[var(--surface-3)]">
                    <div
                      className="absolute inset-y-0 rounded-full bg-[var(--marketing-accent)]"
                      style={{ left: `${row.lo}%`, width: `${Math.max(row.hi - row.lo, 1.5)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[12px] text-zinc-500">Bars run from 0% to 100%. Treat them as ranges, not promises: your texts will differ.</p>
        </div>

        <div className="space-y-6 lg:border-l lg:border-[var(--border-subtle)] lg:pl-10">
          {NOTES.map((n) => (
            <div key={n.title}>
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{n.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-400">{n.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
