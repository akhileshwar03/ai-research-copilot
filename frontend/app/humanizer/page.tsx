"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import { useHumanizeStream } from "@/features/humanizer/hooks/use-humanize-stream";
import { useHumanizerHistory } from "@/features/humanizer/hooks/use-humanizer-history";
import { DiffOutput } from "@/features/humanizer/components/diff-output";
import { HistoryPanel } from "@/features/humanizer/components/history-panel";
import { DEFAULT_WAIT_STAGES, ULTRA_WAIT_STAGES, WaitingExperience } from "@/features/humanizer/components/waiting-experience";
import { humanizerApi, type HumanizeRun, type HumanizeStyle } from "@/services/api/humanizer-api";
import { ImportControls } from "@/features/shared/components/import-controls";
import { AtmosphereBackground } from "@/features/shared/components/atmosphere-background";
import { CursorSpotlight, Glare } from "@/features/shared/motion/motion";
import MainLayout from "@/components/layout/main-layout";
import { takeHumanizerPrefill } from "@/shared/lib/humanizer-handoff";

const MAX_CHARS = 20000;
const MIN_WORDS = 30;
const MAX_WORDS = 3000;

// Ultra-only ceiling, deliberately far below MAX_WORDS — mirrors the backend's
// humanizer_ultra_max_words. Ultra runs a 7B model on local hardware at a measured
// ~4 tok/s, so its real limit is wall clock, not the shared input cap. Keep these in
// sync; the backend rejects over-limit input with a 413 either way, this just means the
// user finds out before waiting rather than after.
const ULTRA_MAX_WORDS = 600;
// ~0.8s of wall clock per input word. Revised up from 0.5 after re-measuring: the model
// generates about 2x the input in WORDS (138 in -> 225 and 274 out across two trials), and
// a cold start costs another ~35s on top (113.6s cold vs 78.2s warm, same input). Better to
// quote a number the run beats than one it misses — an estimate the user watches sail past
// reads as a hang.
const ULTRA_SECONDS_PER_WORD = 0.8;

function estimateUltraSeconds(words: number): string {
  const seconds = Math.max(30, Math.round(words * ULTRA_SECONDS_PER_WORD));
  if (seconds < 90) return `${Math.round(seconds / 15) * 15} seconds`;
  return `${Math.round(seconds / 30) / 2} minutes`;
}

// Which model produces the rewrite — chosen up front, on the input side, before the user
// clicks Humanize. Previously this was an output-side tab (clicked *after* a Basic run had
// already streamed back), which meant Ultra was always a bolt-on afterthought to a Basic
// run rather than a real choice of "which humanizer do I want" made before running anything.
type Mode = "basic" | "ultra";
// The output side now only ever controls *how* the current result is displayed — plain text
// or word-diffed against the source — never which model produced it. That choice lives with
// `mode` above.
type ViewTab = "text" | "diff";
type Phase = "idle" | "reading" | "writing" | "done";
type UltraStatus = "idle" | "loading" | "error" | "done";

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

const MODES: { value: Mode; label: string }[] = [
  { value: "basic", label: "Basic" },
  { value: "ultra", label: "Ultra Human ✨" },
];

const VIEW_TABS: { value: ViewTab; label: string }[] = [
  { value: "text", label: "Rewritten text" },
  { value: "diff", label: "Diff Highlight" },
];

// Basic is the same GPT-4.1-mini rewrite regardless of view — labeled "AI Paraphraser" to
// name what it actually is (a prompted rewrite of an off-the-shelf model). Ultra Human runs
// a real custom-trained model (Qwen2.5-7B + LoRA adapter, see backend/scripts/finetune/STATE.md),
// labeled "DL Trained Model" to name that difference plainly. Each gets its own badge color
// so the distinction reads at a glance, not just in the text.
const MODEL_TAG: Record<Mode, string> = {
  basic: "AI Paraphraser",
  ultra: "DL Trained Model",
};

const MODEL_TAG_STYLE: Record<Mode, { backgroundColor: string; color: string }> = {
  basic: { backgroundColor: "rgba(59,130,246,0.15)", color: "#60a5fa" }, // blue — AI Paraphraser
  ultra: { backgroundColor: "rgba(168,85,247,0.15)", color: "#c084fc" }, // purple — DL Trained Model
};

// The active-mode pill picks up the same per-model color as its badge, so the color coding
// is consistent whether you're looking at the selector or the result panel.
const MODE_ACTIVE_COLOR: Record<Mode, string> = {
  basic: "#3b82f6",
  ultra: "#a855f7",
};

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
  // One-shot handoff from AI Checker's "Apply humanization?" card. Read in
  // the state initializer (this page only renders its form client-side,
  // after the auth guard resolves) so the flagged text is there on the
  // first frame instead of being patched in by an effect.
  const [input, setInput] = useState(() => takeHumanizerPrefill() ?? "");
  const [style, setStyle] = useState<HumanizeStyle>("normal");
  const [expand, setExpand] = useState(false);
  // Which model to run next — set on the left, read only when Humanize is clicked.
  const [mode, setMode] = useState<Mode>("basic");
  // Which model actually produced the result currently on screen — recorded at submit time
  // so toggling `mode` afterward (to set up the *next* run) can't relabel or reinterpret a
  // result that's already showing.
  const [submittedMode, setSubmittedMode] = useState<Mode>("basic");
  const [viewTab, setViewTab] = useState<ViewTab>("text");

  const [output, setOutput] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [submittedWordCount, setSubmittedWordCount] = useState(0);
  const [readingElapsedSeconds, setReadingElapsedSeconds] = useState(0);

  // Ultra Human — the real fine-tuned model. Separate status/output from the GPT stream
  // above since it's a distinct backend call (may not even be reachable — local-Ollama-only
  // right now) with its own timing profile and failure mode.
  const [ultraOutput, setUltraOutput] = useState("");
  const [ultraStatus, setUltraStatus] = useState<UltraStatus>("idle");
  const [ultraError, setUltraError] = useState("");
  const [ultraElapsedSeconds, setUltraElapsedSeconds] = useState(0);
  // Ultra must run against the settings the submitted text was actually run under, not
  // whatever the controls happen to say now. Previously it read the live `style`/`expand`
  // state, so toggling "Allow elaboration" after a run silently made the Ultra output a
  // different mode from the Basic output it sits next to — while both tabs still claimed
  // to be two renderings of the same request.
  const [submittedStyle, setSubmittedStyle] = useState<HumanizeStyle>("normal");
  const [submittedExpand, setSubmittedExpand] = useState(false);

  const { runs: history, isLoading: historyLoading, saveRun, deleteRun, deleteAllRuns } = useHumanizerHistory(
    isReady && isAuthenticated,
  );

  // Drives the staged waiting messages below — only ticks during "reading" so a fast
  // response never shows a timer at all, and resets cleanly the moment tokens start
  // arriving or the run ends.
  useEffect(() => {
    if (phase !== "reading") return;
    const interval = setInterval(() => setReadingElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Same pattern, independent timer for the Ultra Human fetch.
  useEffect(() => {
    if (ultraStatus !== "loading") return;
    const interval = setInterval(() => setUltraElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [ultraStatus]);

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

  const currentWordCount = wordCount(input);
  const overLimit = input.length > MAX_CHARS || currentWordCount > MAX_WORDS;
  const underMinWords = input.trim().length > 0 && currentWordCount < MIN_WORDS;
  const ultraOverLimit = mode === "ultra" && currentWordCount > ULTRA_MAX_WORDS;
  const activeStyle = STYLES.find((s) => s.value === style) ?? STYLES[0];

  // True once a run for the *currently displayed* mode has started — gates the view-tab
  // bar, the model badge, and the copy button. Basic and Ultra track this independently
  // (via `phase`/`ultraStatus`) since they're separate requests; `submittedMode` picks
  // which of the two is actually relevant to what's on screen right now.
  const hasRun = submittedMode === "ultra" ? ultraStatus !== "idle" : phase !== "idle";
  const isBusy = isStreaming || ultraStatus === "loading";

  const resetUltra = () => {
    setUltraOutput("");
    setUltraStatus("idle");
    setUltraError("");
  };

  const resetBasic = () => {
    setOutput("");
    setPhase("idle");
  };

  const runBasic = async (inputText: string) => {
    resetUltra();
    setOutput("");
    setPhase("reading");
    setReadingElapsedSeconds(0);

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

  const runUltra = async (inputText: string, ultraStyle: HumanizeStyle, ultraExpand: boolean) => {
    resetBasic();
    setUltraOutput("");
    setUltraStatus("loading");
    setUltraElapsedSeconds(0);
    setUltraError("");
    try {
      const result = await humanizerApi.ultra(inputText, ultraStyle, ultraExpand);
      setUltraOutput(result.text);
      setUltraStatus("done");
    } catch (err) {
      setUltraError(err instanceof Error ? err.message : "Ultra Human mode failed");
      setUltraStatus("error");
    }
  };

  const handleSubmit = async () => {
    if (!input.trim() || overLimit || underMinWords || isBusy || ultraOverLimit) return;

    const inputText = input;
    setSubmittedText(inputText);
    setSubmittedWordCount(wordCount(inputText));
    setSubmittedStyle(style);
    setSubmittedExpand(expand);
    setSubmittedMode(mode);
    setViewTab("text");

    if (mode === "basic") {
      await runBasic(inputText);
    } else {
      await runUltra(inputText, style, expand);
    }
  };

  const handleUltraRetry = () => {
    if (!submittedText || ultraStatus === "loading") return;
    void runUltra(submittedText, submittedStyle, submittedExpand);
  };

  const handleCopy = async () => {
    const text = submittedMode === "ultra" ? ultraOutput : output;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleSample = () => {
    if (isBusy) return;
    setInput(SAMPLE_TEXT);
  };

  const handleLoadRun = (run: HumanizeRun) => {
    if (isBusy) return;
    setInput(run.input_text);
    setStyle(run.style);
    setMode("basic");
    setSubmittedMode("basic");
    setSubmittedText(run.input_text);
    setSubmittedWordCount(wordCount(run.input_text));
    setSubmittedStyle(run.style);
    // History rows don't record the expand flag, so a loaded run can't claim to know it.
    setSubmittedExpand(false);
    setOutput(run.output_text);
    setPhase("done");
    setViewTab("text");
    resetUltra();
  };

  const handleDeleteRun = (runId: number) => {
    deleteRun(runId).catch(() => toast.error("Couldn't delete that run"));
  };

  const handleDeleteAllRuns = () => {
    deleteAllRuns().catch(() => toast.error("Couldn't clear history"));
  };

  const canCopy = submittedMode === "ultra" ? ultraStatus === "done" : phase === "done";
  const displayedOutput = submittedMode === "ultra" ? ultraOutput : output;
  const humanizeLabel =
    mode === "basic"
      ? phase === "reading"
        ? "Reading your text…"
        : phase === "writing"
          ? "Rewriting…"
          : "Humanize"
      : ultraStatus === "loading"
        ? "Generating with Ultra Human…"
        : "Humanize with Ultra Human";

  return (
    <MainLayout
      background={
        <>
          <AtmosphereBackground variant="soft" />
          <CursorSpotlight color="138,90,110" />
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
              disabled={isBusy}
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
            {/* Model picker — chosen here, before Humanize is clicked, so the user decides
                which humanizer to run instead of discovering Ultra as an output-side
                afterthought. */}
            <div className="mb-3 flex gap-1 rounded-lg border border-[var(--border-subtle)] p-0.5">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  disabled={isBusy}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    mode === m.value ? "text-white" : "text-zinc-500 hover:text-[var(--text-primary)]"
                  }`}
                  style={mode === m.value ? { backgroundColor: MODE_ACTIVE_COLOR[m.value] } : undefined}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {mode === "ultra" && !ultraOverLimit && (
              <p className="mb-2 text-[11px] text-zinc-600">
                Runs a separate model locally, so it&apos;s slow on purpose — roughly{" "}
                {estimateUltraSeconds(currentWordCount)} for this text.
              </p>
            )}

            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">Original text</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSample}
                  disabled={isBusy}
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
              <ImportControls onExtracted={(text) => setInput(text)} disabled={isBusy} />
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste text here…"
              disabled={isBusy}
              className="min-h-[340px] flex-1 resize-none rounded-lg border border-[var(--border-subtle)] bg-transparent p-3 text-[14px] leading-relaxed text-[var(--text-primary)] outline-none focus-accent placeholder:text-zinc-600 disabled:opacity-60"
            />
            {underMinWords && (
              <p className="mt-1.5 text-[11px] text-amber-400">
                {currentWordCount} / {MIN_WORDS} words minimum — there&apos;s not enough text here for the rewrite
                to have much to work with.
              </p>
            )}
            {ultraOverLimit && (
              <p className="mt-1.5 text-[11px] text-amber-400">
                Ultra Human runs a full 7B model locally and handles up to {ULTRA_MAX_WORDS.toLocaleString()} words
                at a time — this text is {currentWordCount.toLocaleString()}. Switch to Basic or shorten the text.
              </p>
            )}
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || overLimit || underMinWords || isBusy || ultraOverLimit}
              className="mt-3 w-full rounded-lg px-3 py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: "var(--marketing-accent)" }}
            >
              {humanizeLabel}
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
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">Rewritten text</p>
                {hasRun && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={MODEL_TAG_STYLE[submittedMode]}
                  >
                    {MODEL_TAG[submittedMode]}
                  </span>
                )}
              </div>
              {canCopy && (
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

            {hasRun && canCopy && (
              <div className="mb-2 flex gap-1 rounded-lg border border-[var(--border-subtle)] p-0.5">
                {VIEW_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setViewTab(tab.value)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                      viewTab === tab.value
                        ? "text-white"
                        : "text-zinc-500 hover:text-[var(--text-primary)]"
                    }`}
                    style={viewTab === tab.value ? { backgroundColor: MODE_ACTIVE_COLOR[submittedMode] } : undefined}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {submittedMode === "ultra" ? (
              ultraStatus === "loading" ? (
                <WaitingExperience elapsedSeconds={ultraElapsedSeconds} stages={ULTRA_WAIT_STAGES} progressThreshold={5} />
              ) : ultraStatus === "error" ? (
                <div className="min-h-[340px] flex-1 rounded-lg border border-[var(--border-subtle)] p-3">
                  <p className="text-[13px] font-medium text-amber-400">Ultra Human mode isn&apos;t available</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">{ultraError}</p>
                  <button
                    onClick={handleUltraRetry}
                    className="mt-3 text-[12px] font-medium text-[var(--marketing-accent-text)] underline underline-offset-2"
                  >
                    Try again
                  </button>
                </div>
              ) : ultraStatus === "done" ? (
                <div className="min-h-[340px] flex-1 rounded-lg border border-[var(--border-subtle)] p-3 text-[14px] leading-relaxed text-[var(--text-primary)]">
                  {viewTab === "diff" ? (
                    <DiffOutput original={submittedText} humanized={ultraOutput} />
                  ) : (
                    <div className="whitespace-pre-wrap">{ultraOutput}</div>
                  )}
                </div>
              ) : null
            ) : phase === "reading" ? (
              <WaitingExperience elapsedSeconds={readingElapsedSeconds} stages={DEFAULT_WAIT_STAGES} />
            ) : (
              <div className="min-h-[340px] flex-1 whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)] p-3 text-[14px] leading-relaxed text-[var(--text-primary)]">
                {output ? (
                  phase === "done" ? (
                    viewTab === "diff" ? (
                      <DiffOutput original={submittedText} humanized={output} />
                    ) : (
                      output
                    )
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

            {canCopy && (
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[11px] text-zinc-500">
                  {submittedWordCount.toLocaleString()} → {wordCount(displayedOutput).toLocaleString()} words
                </p>
                <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: MODEL_TAG_STYLE[submittedMode].color }}
                  />
                  {viewTab === "diff" ? "Highlighted = changed" : MODEL_TAG[submittedMode]}
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
