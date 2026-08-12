"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import { setHumanizerPrefill } from "@/shared/lib/humanizer-handoff";
import { checkerApi, type CheckResult } from "@/services/api/checker-api";
import { ScanningPanel } from "@/features/checker/components/scanning-panel";
import { ProbabilityGauge } from "@/features/checker/components/probability-gauge";
import { ConfidenceMeter } from "@/features/checker/components/confidence-meter";
import { SignalBar } from "@/features/checker/components/signal-bar";
import { WritingFeedbackPanel } from "@/features/checker/components/writing-feedback-panel";
import { ImportControls } from "@/features/shared/components/import-controls";
import { CheckerBackground } from "@/features/checker/components/checker-background";
import { CursorSpotlight, Glare, Reveal, Tilt3D } from "@/features/shared/motion/motion";
import { TrustSection } from "@/features/checker/components/trust-section";
import MainLayout from "@/components/layout/main-layout";
import { ProductShellSidebar } from "@/components/layout/product-shell-sidebar";

type Mode = "detect" | "feedback";

const MAX_CHARS = 20000;

const VERDICT_STYLES: Record<
  CheckResult["verdict"],
  { label: string; className: string; color: string }
> = {
  likely_human: { label: "HUMAN-WRITTEN", className: "bg-emerald-500/10 text-emerald-400", color: "#34d399" },
  uncertain: { label: "MIXED SIGNALS", className: "bg-amber-500/10 text-amber-400", color: "#fbbf24" },
  likely_ai: { label: "AI-GENERATED", className: "bg-red-500/10 text-red-400", color: "#f87171" },
};

function headline(result: CheckResult): string {
  const p = result.ai_probability;
  if (result.verdict === "likely_ai") {
    return p >= 0.85 ? "We're highly confident this text is AI-generated" : "This text is likely AI-generated";
  }
  if (result.verdict === "likely_human") {
    return p <= 0.15 ? "We're highly confident this text is human-written" : "This text is likely human-written";
  }
  return "Mixed signals — this text could be either";
}

type Tone = "good" | "bad" | "neutral";
function band(value: number, lowCut: number, highCut: number, invert = false): { tag: string; tone: Tone } {
  // invert=false: higher value = more human (good). invert=true: higher = more AI (bad).
  const low = value < lowCut;
  const high = value >= highCut;
  if (!invert) {
    if (high) return { tag: "varied", tone: "good" };
    if (low) return { tag: "uniform", tone: "bad" };
    return { tag: "moderate", tone: "neutral" };
  }
  if (high) return { tag: "high", tone: "bad" };
  if (low) return { tag: "low", tone: "good" };
  return { tag: "medium", tone: "neutral" };
}

function highlightSentences(source: string, sentences: string[]): ReactNode {
  if (!sentences.length) return source;
  const lower = source.toLowerCase();
  const ranges = sentences
    .map((s) => {
      const idx = lower.indexOf(s.toLowerCase());
      return idx >= 0 ? ([idx, idx + s.length] as const) : null;
    })
    .filter((r): r is readonly [number, number] => r !== null)
    .sort((a, b) => a[0] - b[0]);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start < cursor) return;
    if (start > cursor) nodes.push(<Fragment key={`t${i}`}>{source.slice(cursor, start)}</Fragment>);
    nodes.push(
      <mark key={`m${i}`} className="rounded bg-red-500/20 px-0.5 text-red-200">
        {source.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < source.length) nodes.push(<Fragment key="tail">{source.slice(cursor)}</Fragment>);
  return nodes;
}

function AnalysisRail({ result, onHumanize }: { result: CheckResult; onHumanize?: () => void }) {
  const verdict = VERDICT_STYLES[result.verdict];
  const pct = Math.round(result.ai_probability * 100);
  const s = result.signals;

  const burst = band(s.burstiness, 0.4, 0.6);
  const div = band(s.lexical_diversity, 0.45, 0.6);
  const phraseTone: Tone = s.ai_phrase_hits === 0 ? "good" : s.ai_phrase_hits <= 2 ? "neutral" : "bad";
  const phraseTag = s.ai_phrase_hits === 0 ? "none" : s.ai_phrase_hits <= 2 ? "a few" : "many";
  const heur = band(s.heuristic_score, 33, 66, true);

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative flex items-center justify-center">
          <span
            className="pointer-events-none absolute h-32 w-32 rounded-full blur-2xl"
            style={{ backgroundColor: verdict.color, opacity: 0.16 }}
            aria-hidden
          />
          <ProbabilityGauge targetPct={pct} color={verdict.color} />
        </div>
        <span className={`rounded-full px-3 py-1 text-[12px] font-bold tracking-wide ${verdict.className}`}>
          {verdict.label}
        </span>
        <p className="font-headline text-[16px] font-bold leading-snug text-[var(--text-primary)]">
          {headline(result)}
        </p>
      </div>

      <ConfidenceMeter aiPct={pct} color={verdict.color} />

      <p className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3 text-[13px] leading-relaxed text-zinc-400">
        {result.explanation}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <SignalBar
          label="Sentence variation"
          value={s.burstiness.toFixed(2)}
          fill={s.burstiness}
          tag={burst.tag}
          tone={burst.tone}
        />
        <SignalBar
          label="Lexical diversity"
          value={s.lexical_diversity.toFixed(2)}
          fill={s.lexical_diversity}
          tag={div.tag === "varied" ? "rich" : div.tag === "uniform" ? "repetitive" : "moderate"}
          tone={div.tone}
        />
        <SignalBar
          label="AI-tell phrases"
          value={String(s.ai_phrase_hits)}
          fill={Math.min(s.ai_phrase_hits / 5, 1)}
          tag={phraseTag}
          tone={phraseTone}
        />
        <SignalBar
          label="Heuristic score"
          value={s.heuristic_score.toFixed(0)}
          fill={s.heuristic_score / 100}
          tag={heur.tag}
          tone={heur.tone}
        />
      </div>

      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
        <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 capitalize text-zinc-400">
          {result.confidence} confidence
        </span>
        {s.llm_probability !== null && <span>Model estimate {Math.round(s.llm_probability * 100)}%</span>}
      </div>

      <p className="border-t border-[var(--border-subtle)] pt-3 text-[11px] leading-relaxed text-zinc-600">
        {result.disclaimer}
      </p>

      {result.verdict === "likely_ai" && onHumanize && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-[var(--text-primary)]">Apply humanization?</p>
            <p className="text-[11px] text-zinc-500">Rewrite this text so it reads naturally.</p>
          </div>
          <button
            onClick={onHumanize}
            className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: "var(--marketing-accent)" }}
          >
            Humanize
          </button>
        </div>
      )}
    </div>
  );
}

function IdleRail() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-2xl"
        style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
        </svg>
      </div>
      <p className="text-[13px] font-medium text-[var(--text-primary)]">Awaiting text</p>
      <p className="max-w-[240px] text-[12px] leading-relaxed text-zinc-500">
        Paste writing or upload a PDF, then run a scan. We weigh sentence rhythm, word choice, and a semantic model
        estimate into one decisive call.
      </p>
    </div>
  );
}

export default function CheckerPage() {
  const router = useRouter();
  const { isReady, isAuthenticated } = useAuthGuard();
  const [mode, setMode] = useState<Mode>("detect");
  const [tab, setTab] = useState<"text" | "document">("text");
  const [advancedScan, setAdvancedScan] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [analyzedText, setAnalyzedText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const textMutation = useMutation({
    mutationFn: (value: string) => checkerApi.checkText(value, advancedScan),
    onSuccess: setResult,
    onError: (err) => toast.error(err instanceof Error ? err.message : "Check failed"),
  });

  const documentMutation = useMutation({
    mutationFn: (file: File) => checkerApi.checkDocument(file),
    onSuccess: setResult,
    onError: (err) => toast.error(err instanceof Error ? err.message : "Check failed"),
  });

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

  const overLimit = text.length > MAX_CHARS;
  const isPending = textMutation.isPending || documentMutation.isPending;
  const aiSentences = result?.ai_sentences ?? [];

  const handleFilePicked = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are supported");
      return;
    }
    setResult(null);
    setAnalyzedText(null);
    documentMutation.mutate(file);
  };

  return (
    <MainLayout
      sidebar={<ProductShellSidebar />}
      background={
        <>
          <CheckerBackground />
          <CursorSpotlight color="138,90,110" />
        </>
      }
    >
    <div className="relative h-full overflow-y-auto px-6 py-8">
      <div className="relative z-10 mx-auto max-w-6xl space-y-6">
        <Reveal>
        <Glare>
        <header className="glass-card flex items-center justify-between rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="font-headline text-xl font-bold tracking-tight text-[var(--text-primary)]">
                Checker
              </h1>
              <p className="mt-0.5 text-[13px] text-zinc-500">
                {mode === "detect"
                  ? "Decisive AI-text detection with sentence-level analysis"
                  : "Free grammar, spelling, and style feedback"}
              </p>
            </div>
          </div>
        </header>
        </Glare>
        </Reveal>

        <div className="glass-card flex gap-1 rounded-lg p-1">
          {(
            [
              { value: "detect", label: "AI Detector" },
              { value: "feedback", label: "Writing Feedback" },
            ] as const
          ).map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`flex-1 rounded-md py-2 text-[13px] font-medium transition-colors ${
                mode === m.value ? "text-white shadow-sm" : "text-zinc-500 hover-surface"
              }`}
              style={mode === m.value ? { backgroundColor: "var(--marketing-accent)" } : undefined}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "feedback" ? (
          <WritingFeedbackPanel />
        ) : (
          <>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
          {/* Input — Glare only, no Tilt3D: a tilting card would be
              disorienting while placing a text cursor or selecting text. */}
          <Glare>
          <div className="glass-card rounded-2xl p-4">
            <div className="mb-4 flex gap-1 rounded-lg border border-[var(--border-subtle)] p-1">
              {(["text", "document"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 rounded-md py-1.5 text-[13px] font-medium transition-colors ${
                    tab === t ? "bg-[var(--surface-2)] text-[var(--text-primary)]" : "text-zinc-500 hover-surface"
                  }`}
                >
                  {t === "text" ? "Paste text" : "Upload PDF"}
                </button>
              ))}
            </div>

            {tab === "text" ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">Text to check</p>
                  <p className={`text-[11px] ${overLimit ? "text-red-400" : "text-zinc-500"}`}>
                    {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                  </p>
                </div>

                <div className="mb-2">
                  <ImportControls onExtracted={(t) => setText(t)} />
                </div>

                <label className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] px-3 py-2 text-[12px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={advancedScan}
                    onChange={(e) => setAdvancedScan(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--marketing-accent)]"
                  />
                  <span className="font-medium text-zinc-300">Advanced Scan</span>
                  <span className="text-zinc-500">— paragraph-by-paragraph breakdown, one extra pass, slower</span>
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste text here…"
                  className="min-h-[340px] w-full resize-none rounded-lg border border-[var(--border-subtle)] bg-transparent p-3 text-[14px] leading-relaxed text-[var(--text-primary)] outline-none focus-accent placeholder:text-zinc-600"
                />
                <button
                  onClick={() => {
                    if (!text.trim() || overLimit) return;
                    setResult(null);
                    setAnalyzedText(text);
                    textMutation.mutate(text);
                  }}
                  disabled={!text.trim() || overLimit || isPending}
                  className="mt-3 w-full rounded-lg px-3 py-2.5 text-[13px] font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  style={{
                    backgroundColor: "var(--marketing-accent)",
                    boxShadow: "0 8px 24px -8px var(--marketing-accent-soft)",
                  }}
                >
                  {textMutation.isPending ? "Scanning…" : "Run detection"}
                </button>
              </div>
            ) : (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => handleFilePicked(e.target.files?.[0])}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPending}
                  className="flex min-h-[340px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-subtle)] text-zinc-500 hover-surface disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  <span className="text-[13px]">{documentMutation.isPending ? "Scanning…" : "Click to upload a PDF"}</span>
                </button>
              </div>
            )}
          </div>
          </Glare>

          {/* Analysis rail — display-only, so both tilt and glare are fine here. */}
          <Tilt3D className="self-start lg:sticky lg:top-6">
          <Glare>
          <div className="glass-card rounded-2xl p-4">
            {isPending ? <ScanningPanel /> : result ? (
              <AnalysisRail
                result={result}
                onHumanize={() => {
                  const handoffText = analyzedText ?? result.paragraphs.map((p) => p.text).join("\n\n");
                  if (!handoffText.trim()) return;
                  setHumanizerPrefill(handoffText);
                  router.push("/humanizer");
                }}
              />
            ) : <IdleRail />}
          </div>
          </Glare>
          </Tilt3D>
        </div>

        {!isPending && !result && (
          <TrustSection />
        )}

        {/* Advanced Scan: paragraph-level breakdown (full width) */}
        {!isPending && result && result.paragraphs.length > 0 && (
          <Glare>
          <div className="glass-card rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">Paragraph-level breakdown</p>
              <span className="text-[11px] text-zinc-500">Advanced Scan · {result.paragraphs.length} segments</span>
            </div>
            <div className="space-y-2">
              {result.paragraphs.map((p, i) => {
                const pct = Math.round(p.ai_probability * 100);
                const style = VERDICT_STYLES[p.verdict];
                return (
                  <div key={i} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${style.className}`}>
                        {pct}% AI
                      </span>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: style.color }} />
                      </div>
                    </div>
                    <p className="text-[13px] leading-relaxed text-zinc-300">{p.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
          </Glare>
        )}

        {/* Sentence-level analysis (full width) */}
        {!isPending && result && analyzedText && aiSentences.length > 0 && (
          <Glare>
          <div className="glass-card rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">Sentence-level analysis</p>
              <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500/30" />
                {aiSentences.length} sentence{aiSentences.length === 1 ? "" : "s"} flagged as AI-like
              </span>
            </div>
            <p className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3 text-[13.5px] leading-relaxed whitespace-pre-wrap text-zinc-300">
              {highlightSentences(analyzedText, aiSentences)}
            </p>
          </div>
          </Glare>
        )}
          </>
        )}
      </div>
    </div>
    </MainLayout>
  );
}
