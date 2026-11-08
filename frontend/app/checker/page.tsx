"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import { ToolLanding } from "@/features/landing/tool-landing";
import { useAppConfig } from "@/features/shared/hooks/use-app-config";
import { oversizeMessage } from "@/shared/lib/upload-limits";
import { setHumanizerPrefill } from "@/shared/lib/humanizer-handoff";
import { checkerApi } from "@/services/api/checker-api";
import { countWords } from "@/features/checker/verdict";
import { AboutChecker } from "@/features/checker/components/about-checker";
import { CheckerBackground } from "@/features/checker/components/checker-background";
import { ErrorPanel } from "@/features/checker/components/error-panel";
import { IdlePanel } from "@/features/checker/components/idle-panel";
import { ResultPanel } from "@/features/checker/components/result-panel";
import { ResultSkeleton } from "@/features/checker/components/result-skeleton";
import { SentenceView } from "@/features/checker/components/sentence-view";
import { ImportControls } from "@/features/shared/components/import-controls";
import { PageBackground } from "@/features/shared/components/page-background";
import MainLayout from "@/components/layout/main-layout";

type Submission = { kind: "text"; text: string } | { kind: "document"; file: File };
type Tab = "text" | "document";

const TABS: { value: Tab; label: string }[] = [
  { value: "text", label: "Paste text" },
  { value: "document", label: "Upload PDF" },
];

export default function CheckerPage() {
  const router = useRouter();
  const { isReady, isAuthenticated } = useAuthGuard({ redirect: false });
  const { config } = useAppConfig();
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  const check = useMutation({
    mutationFn: (submission: Submission) =>
      submission.kind === "text" ? checkerApi.checkText(submission.text) : checkerApi.checkDocument(submission.file),
  });

  const words = useMemo(() => countWords(text), [text]);

  // On narrow screens the result sits below the input; bring it into view when it arrives.
  const outcome = check.data ?? check.error;
  useEffect(() => {
    if (outcome && window.matchMedia("(max-width: 1023px)").matches) {
      resultRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [outcome]);

  if (isReady && !isAuthenticated) {
    return <ToolLanding tool="checker" />;
  }

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--app-bg)]">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--marketing-accent)" }}
        />
      </div>
    );
  }

  const minWords = config.checker_min_words;
  const maxChars = config.checker_max_chars;
  const overLimit = text.length > maxChars;
  const tooShort = words < minWords;
  const canRun = !tooShort && !overLimit && !check.isPending;

  const run = (submission: Submission) => {
    setInputError(null);
    check.mutate(submission);
  };

  const handleFilePicked = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setInputError("Only PDF files are supported.");
      return;
    }
    // Reject an oversized file before uploading it, instead of after a long upload.
    const oversize = oversizeMessage(file, config.max_upload_size_mb);
    if (oversize) {
      setInputError(oversize);
      return;
    }
    run({ kind: "document", file });
  };

  const wordHint =
    words === 0
      ? `Paste at least ${minWords} words.`
      : tooShort
        ? `${words.toLocaleString()} ${words === 1 ? "word" : "words"}. Add ${(minWords - words).toLocaleString()} more to run the check.`
        : `${words.toLocaleString()} words`;

  const handoff = () => {
    const sentences = check.data?.sentences ?? [];
    const handoffText = sentences.map((s) => s.text).join(" ");
    if (!handoffText.trim()) return;
    setHumanizerPrefill(handoffText);
    router.push("/humanizer");
  };

  const errorMessage = inputError ?? (check.error instanceof Error ? check.error.message : check.error ? "Something went wrong. Please try again." : null);

  let resultContent;
  if (check.isPending) {
    resultContent = <ResultSkeleton />;
  } else if (check.data) {
    resultContent = <ResultPanel result={check.data} onHumanize={handoff} />;
  } else if (errorMessage) {
    const retryWith = !inputError ? check.variables : undefined;
    resultContent = <ErrorPanel message={errorMessage} onRetry={retryWith ? () => run(retryWith) : undefined} />;
  } else {
    resultContent = <IdlePanel minWords={minWords} />;
  }

  return (
    <MainLayout background={<PageBackground page="checker" dynamic={<CheckerBackground />} />}>
      <div className="relative h-full overflow-y-auto px-6 py-8">
        <div className="relative z-10 mx-auto max-w-6xl space-y-6">
          <header className="glass-card rounded-2xl px-5 py-4">
            <h1 className="font-headline text-xl font-bold tracking-tight text-[var(--text-primary)]">AI Checker</h1>
            <p className="mt-1 text-[13.5px] text-zinc-400">
              Find out whether a text was written by a person, an AI, or both.
            </p>
          </header>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section aria-label="Text to check" className="glass-card rounded-2xl p-5">
              <div role="tablist" aria-label="Input method" className="mb-4 flex gap-1 rounded-lg border border-[var(--border-subtle)] p-1">
                {TABS.map((t) => (
                  <button
                    key={t.value}
                    role="tab"
                    id={`checker-tab-${t.value}`}
                    aria-selected={tab === t.value}
                    aria-controls={`checker-panel-${t.value}`}
                    onClick={() => {
                      setTab(t.value);
                      setInputError(null);
                    }}
                    className={`flex-1 rounded-md py-1.5 text-[13px] font-medium transition-colors ${
                      tab === t.value ? "bg-[var(--surface-2)] text-[var(--text-primary)]" : "text-zinc-400 hover-surface"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "text" ? (
                <div role="tabpanel" id="checker-panel-text" aria-labelledby="checker-tab-text">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="checker-text" className="text-[13px] font-medium text-[var(--text-primary)]">
                      Text to check
                    </label>
                    <ImportControls onExtracted={(t) => setText(t)} disabled={check.isPending} />
                  </div>
                  <textarea
                    id="checker-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) run({ kind: "text", text });
                    }}
                    placeholder="Paste the text you want to check…"
                    aria-describedby="checker-text-hint"
                    className="min-h-[220px] w-full resize-y rounded-lg md:min-h-[340px] border border-[var(--border-subtle)] bg-transparent p-3 text-[14px] leading-relaxed text-[var(--text-primary)] outline-none focus-accent placeholder:text-zinc-400"
                  />
                  <div id="checker-text-hint" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                    <span className="text-zinc-400">{wordHint}</span>
                    {(overLimit || text.length > maxChars * 0.8) && (
                      <span className={overLimit ? "text-[var(--verdict-ai)]" : "text-zinc-400"}>
                        {text.length.toLocaleString()} / {maxChars.toLocaleString()} characters
                        {overLimit ? ". Shorten the text to continue." : ""}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => run({ kind: "text", text })}
                    disabled={!canRun}
                    className="mt-3 w-full rounded-lg px-3 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ backgroundColor: "var(--marketing-accent)" }}
                  >
                    {check.isPending ? "Checking…" : "Check text"}
                  </button>
                  <p className="mt-2 hidden text-center text-[12px] text-zinc-400 md:block">Tip: press Ctrl or Cmd + Enter to check.</p>
                </div>
              ) : (
                <div role="tabpanel" id="checker-panel-document" aria-labelledby="checker-tab-document">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      handleFilePicked(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed md:min-h-[340px] border-[var(--border-medium)] px-6 text-center">
                    <p className="text-[14px] font-medium text-[var(--text-primary)]">Upload a PDF to check</p>
                    <p className="max-w-xs text-[12.5px] leading-relaxed text-zinc-400">
                      Up to {config.max_upload_size_mb} MB. The PDF needs selectable text; scanned pages without text
                      can&rsquo;t be read.
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={check.isPending}
                      className="rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ backgroundColor: "var(--marketing-accent)" }}
                    >
                      {check.isPending ? "Checking…" : "Choose a PDF"}
                    </button>
                  </div>
                </div>
              )}
            </section>

            <aside
              ref={resultRef}
              aria-label="Result"
              aria-live="polite"
              className="glass-card self-start rounded-2xl p-5 lg:sticky lg:top-6"
            >
              {resultContent}
            </aside>
          </div>

          {check.data && !check.isPending && <SentenceView result={check.data} />}

          <AboutChecker />
        </div>
      </div>
    </MainLayout>
  );
}
