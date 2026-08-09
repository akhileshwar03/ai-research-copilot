"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import { useHumanizeStream } from "@/features/humanizer/hooks/use-humanize-stream";
import { useHumanizerHistory } from "@/features/humanizer/hooks/use-humanizer-history";
import { DiffOutput } from "@/features/humanizer/components/diff-output";
import { HistoryPanel } from "@/features/humanizer/components/history-panel";
import { Skeleton } from "@/components/ui/skeleton";
import type { HumanizeRun, HumanizeStyle } from "@/services/api/humanizer-api";
import { ImportControls } from "@/features/shared/components/import-controls";
import { AtmosphereBackground } from "@/features/shared/components/atmosphere-background";
import { CursorSpotlight, Glare } from "@/features/shared/motion/motion";
import MainLayout from "@/components/layout/main-layout";
import { ProductShellSidebar } from "@/components/layout/product-shell-sidebar";
import { takeHumanizerPrefill } from "@/shared/lib/humanizer-handoff";

const MAX_CHARS = 20000;
const MIN_WORDS = 30;
const MAX_WORDS = 3000;

type Phase = "idle" | "reading" | "writing" | "done";

// `clear_structured` and `simple_formal` are parked, not deleted: the backend, DB schema, and
// HumanizeStyle type still fully support them (see backend/scripts/finetune/STATE.md for why —
// Phase 2 found they need more work before shipping). Only `normal` is exposed in the UI for now.
const STYLES: { value: HumanizeStyle; label: string; desc: string }[] = [
  {
    value: "normal",
    label: "Normal",
    desc: "Blog posts, social copy, product writing — natural and direct.",
  },
];

const SAMPLE_TEXT =
  "Moreover, it is important to note that artificial intelligence plays a crucial role in " +
  "modern society. Furthermore, the technology continues to evolve rapidly, and organizations " +
  "must navigate the complexities of this ever-evolving landscape in order to remain competitive " +
  "and unlock the full potential of their operations. Additionally, it is worth noting that " +
  "businesses across every industry are racing to adopt these tools, from healthcare to finance " +
  "to retail. In today's world, staying ahead of the curve requires a holistic approach that " +
  "balances innovation with careful oversight, and organizations that fail to adapt risk falling " +
  "behind their competitors in this fast-paced environment.";

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export default function HumanizerPage() {
  const { isReady, isAuthenticated } = useAuthGuard();
  const { stream, isStreaming } = useHumanizeStream();
  const [input, setInput] = useState("");
  const [style, setStyle] = useState<HumanizeStyle>("normal");
  const [expand, setExpand] = useState(false);
  const [output, setOutput] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [submittedWordCount, setSubmittedWordCount] = useState(0);
  const { runs: history, isLoading: historyLoading, saveRun, deleteRun, deleteAllRuns } = useHumanizerHistory(
    isReady && isAuthenticated,
  );

  // One-shot handoff from AI Checker's "Apply humanization?" card
  useEffect(() => {
    const prefill = takeHumanizerPrefill();
    if (prefill) {
      setInput(prefill);
      toast.success("Loaded flagged text from AI Checker");
    }
  }, []);

  if (!isReady || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--app-bg)]">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--marketing-accent)" }}
        />
      </div>
    );
  }

  const overLimit = input.length > MAX_CHARS || wordCount(input) > MAX_WORDS;
  const currentWordCount = wordCount(input);
  const underMinWords = input.trim().length > 0 && currentWordCount < MIN_WORDS;
  const activeStyle = STYLES.find((s) => s.value === style) ?? STYLES[0];

  const handleSubmit = async () => {
    if (!input.trim() || overLimit || underMinWords || isStreaming) return;

    const inputText = input;
    setOutput("");
    setSubmittedText(inputText);
    setSubmittedWordCount(wordCount(inputText));
    setPhase("reading");

    try {
      let firstToken = true;
      const finalText = await stream({
        text: inputText,
        style,
        expand,
        onToken: (accumulated) => {
          if (firstToken) {
            setPhase("writing");
            firstToken = false;
          }
          setOutput(accumulated);
        },
      });
      setPhase("done");

      saveRun({ inputText, outputText: finalText, style }).catch(() => {
        // History persistence is best-effort — a save failure shouldn't surface as a humanize failure.
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Humanize failed");
      setPhase("idle");
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    toast.success("Copied to clipboard");
  };

  const handleSample = () => {
    if (isStreaming) return;
    setInput(SAMPLE_TEXT);
  };

  const handleLoadRun = (run: HumanizeRun) => {
    if (isStreaming) return;
    setInput(run.input_text);
    setStyle(run.style);
    setSubmittedText(run.input_text);
    setSubmittedWordCount(wordCount(run.input_text));
    setOutput(run.output_text);
    setPhase("done");
  };

  const handleDeleteRun = (runId: number) => {
    deleteRun(runId).catch(() => toast.error("Couldn't delete that run"));
  };

  const handleDeleteAllRuns = () => {
    deleteAllRuns().catch(() => toast.error("Couldn't clear history"));
  };

  return (
    <MainLayout
      sidebar={<ProductShellSidebar />}
      background={
        <>
          <AtmosphereBackground variant="soft" />
          <CursorSpotlight color="197,105,31" />
        </>
      }
    >
    <div className="relative h-full overflow-y-auto px-6 py-8">
      <div className="relative z-10 mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform ${
                phase === "reading" || phase === "writing" ? "animate-pulse" : ""
              }`}
              style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
              </svg>
            </div>
            <div>
              <h1 className="font-headline text-xl font-bold tracking-tight text-[var(--text-primary)]">
                Humanizer
              </h1>
              <p className="mt-0.5 text-[13px] text-zinc-500">Rewrite AI-sounding text so it reads naturally</p>
            </div>
          </div>
          <HistoryPanel
            runs={history}
            isLoading={historyLoading}
            onLoad={handleLoadRun}
            onDelete={handleDeleteRun}
            onDeleteAll={handleDeleteAllRuns}
          />
        </header>

        {/* Writing style */}
        <Glare className="glass-card block rounded-2xl">
        <div className="p-4">
          <p className="text-[12px] text-zinc-500">
            <span className="font-medium text-[var(--marketing-accent-text)]">{activeStyle.label}:</span>{" "}
            {activeStyle.desc}
          </p>

          <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-[var(--border-subtle)] pt-3">
            <input
              type="checkbox"
              checked={expand}
              onChange={(e) => setExpand(e.target.checked)}
              disabled={isStreaming}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--marketing-accent)] disabled:cursor-not-allowed"
            />
            <span className="text-[11px] leading-snug text-zinc-500">
              <span className="font-medium text-[var(--text-primary)]">Allow elaboration</span> — lets the rewrite
              add brief clarifying context or framing instead of only rewording. The output is{" "}
              <span className="text-amber-400">no longer a strict same-facts-same-length rewrite</span>; review it
              carefully before use.
            </span>
          </label>
        </div>
        </Glare>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Input */}
          <Glare className="glass-card flex h-full flex-col rounded-2xl">
          <div className="flex h-full flex-col p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">Original text</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSample}
                  disabled={isStreaming}
                  className="text-[11px] text-zinc-500 underline-offset-2 hover:text-[var(--marketing-accent-text)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Try a sample
                </button>
                <p className={`text-[11px] ${overLimit ? "text-red-400" : underMinWords ? "text-amber-400" : "text-zinc-500"}`}>
                  {currentWordCount.toLocaleString()} / {MAX_WORDS.toLocaleString()} words
                </p>
              </div>
            </div>
            <div className="mb-2">
              <ImportControls onExtracted={(text) => setInput(text)} disabled={isStreaming} />
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste text here…"
              disabled={isStreaming}
              className="min-h-[340px] flex-1 resize-none rounded-lg border border-[var(--border-subtle)] bg-transparent p-3 text-[14px] leading-relaxed text-[var(--text-primary)] outline-none focus-accent placeholder:text-zinc-600 disabled:opacity-60"
            />
            {underMinWords && (
              <p className="mt-1.5 text-[11px] text-amber-400">
                {currentWordCount} / {MIN_WORDS} words minimum — there&apos;s not enough text here for the rewrite
                to have much to work with.
              </p>
            )}
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || overLimit || underMinWords || isStreaming}
              className="mt-3 w-full rounded-lg px-3 py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: "var(--marketing-accent)" }}
            >
              {phase === "reading" ? "Reading your text…" : phase === "writing" ? "Rewriting…" : "Humanize"}
            </button>
          </div>
          </Glare>

          {/* Output — the mockup's asymmetry: only this panel gets the
              copper-glow border, signaling "this is the refined result". */}
          <Glare
            className="glass-card flex h-full flex-col rounded-2xl"
            style={{ boxShadow: "0 0 0 1px var(--accent-glow), 0 20px 40px -24px rgba(120,74,30,0.18)" }}
          >
          <div className="flex h-full flex-col p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">Rewritten text</p>
              {phase === "done" && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded-md border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-zinc-400 hover-surface"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                  </svg>
                  Copy
                </button>
              )}
            </div>

            {phase === "reading" ? (
              <div className="min-h-[340px] flex-1 space-y-2.5 rounded-lg border border-[var(--border-subtle)] p-3">
                <Skeleton className="h-3 w-[92%]" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-[85%]" />
                <Skeleton className="h-3 w-[70%]" />
                <p className="pt-3 text-[12px] text-zinc-500">Reading your text…</p>
              </div>
            ) : (
              <div className="min-h-[340px] flex-1 whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)] p-3 text-[14px] leading-relaxed text-[var(--text-primary)]">
                {output ? (
                  phase === "done" ? (
                    <DiffOutput original={submittedText} humanized={output} />
                  ) : (
                    <>
                      {output}
                      <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-current align-middle" />
                    </>
                  )
                ) : (
                  <span className="text-zinc-600">Your rewritten text will appear here.</span>
                )}
              </div>
            )}

            {phase === "done" && (
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[11px] text-zinc-500">
                  {submittedWordCount.toLocaleString()} → {wordCount(output).toLocaleString()} words
                </p>
                <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: "var(--marketing-accent-soft)" }}
                  />
                  Highlighted = changed
                </p>
              </div>
            )}
          </div>
          </Glare>
        </div>

        <p className="text-[12px] text-zinc-500">
          {expand ? (
            <>
              Elaboration mode is on — the rewrite may add brief context or framing beyond the source, not just
              reword it. Review the output before using it; this tool does not verify factual accuracy.
            </>
          ) : (
            <>
              Meaning, facts, and claims are preserved — only phrasing and rhythm change. Review the output before
              using it; this tool does not verify factual accuracy.
            </>
          )}
        </p>
      </div>
    </div>
    </MainLayout>
  );
}
