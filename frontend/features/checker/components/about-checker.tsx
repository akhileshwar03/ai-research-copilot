/** What the checker can and can't do, in plain words. The figures come from our own evaluation on several
 *  thousand held-out texts at the strict verdict setting. Update them whenever the model changes. */
const EXPECTATIONS = [
  { what: "Text written by AI models such as ChatGPT, Claude and Gemini", result: "Caught about 85–99% of the time" },
  { what: "AI text rewritten by other humanizer tools", result: "Caught about 65–90% of the time" },
  { what: "Real human writing", result: "Wrongly flagged about 0–4% of the time" },
  { what: "AI text edited by a person, or rewritten to sound human", result: "Often missed: caught about 25–60% of the time" },
];

export function AboutChecker() {
  return (
    <section aria-labelledby="about-title" className="glass-card rounded-2xl p-6">
      <h2 id="about-title" className="font-headline text-[20px] font-bold tracking-tight text-[var(--text-primary)]">
        What this checker can and can&rsquo;t do
      </h2>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-zinc-400">
        No AI detector is certain, ours included. Here is what to expect, so you can judge a result for yourself.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-[13.5px]">
          <caption className="sr-only">Results of our own tests, by kind of text</caption>
          <thead>
            <tr className="border-b border-[var(--border-medium)] text-zinc-400">
              <th scope="col" className="py-2 pr-4 font-medium">
                Kind of text
              </th>
              <th scope="col" className="py-2 font-medium">
                In our tests
              </th>
            </tr>
          </thead>
          <tbody>
            {EXPECTATIONS.map((row) => (
              <tr key={row.what} className="border-b border-[var(--border-subtle)] last:border-0">
                <th scope="row" className="py-3 pr-4 font-normal text-zinc-300">
                  {row.what}
                </th>
                <td className="py-3 text-[var(--text-primary)]">{row.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-zinc-400">
        Figures are from our own tests on several thousand texts and will differ on yours. Works on English text only.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">How it works</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-zinc-400">
            <li>You paste text or upload a PDF.</li>
            <li>A model trained on human and AI writing reads the whole text, then each sentence.</li>
            <li>You get a verdict (likely human, unsure or likely AI) and the sentences that stand out.</li>
          </ol>
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Your text</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">
              We don&rsquo;t save the text you check. It goes over an encrypted connection to our own checker server, is
              scored, and is not kept.
            </p>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Use it with care</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">
              A detector can be wrong in both directions. Don&rsquo;t use a result to accuse or penalise anyone.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
