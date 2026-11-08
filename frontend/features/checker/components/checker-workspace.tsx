"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { useAppConfig } from "@/features/shared/hooks/use-app-config";
import { oversizeMessage } from "@/shared/lib/upload-limits";
import { setHumanizerPrefill } from "@/shared/lib/humanizer-handoff";
import { clearReturnTo, setReturnTo } from "@/shared/lib/return-to";
import { checkerApi } from "@/services/api/checker-api";
import { extractApi } from "@/services/api/extract-api";
import { clearCheckerDraft, readCheckerDraft, saveCheckerDraft } from "@/features/checker/draft";
import { countWords, formatFileSize, trimToLimit } from "@/features/checker/verdict";
import { SAMPLES } from "@/features/checker/samples";
import { AnnotatedDocument } from "@/features/checker/components/annotated-document";
import { ErrorPanel } from "@/features/checker/components/error-panel";
import { HowToRead } from "@/features/checker/components/how-to-read";
import { ProgressNote } from "@/features/checker/components/progress-note";
import { ReportBand } from "@/features/checker/components/report-band";
import { ResultSkeleton } from "@/features/checker/components/result-skeleton";
import { ImportControls } from "@/features/shared/components/import-controls";

type Tab = "text" | "document";

const TABS: { value: Tab; label: string }[] = [
  { value: "text", label: "Paste text" },
  { value: "document", label: "Upload PDF" },
];

/** The tool itself: paste or upload, run the check, read the report. The same on the public page and in the app;
 *  only `signedIn` changes what the buttons do. */
export function CheckerWorkspace({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const { config } = useAppConfig();
  const [tab, setTab] = useState<Tab>("text");
  // Text pasted before signing in is kept across the sign-in and put back here.
  const [text, setText] = useState(() => (signedIn ? readCheckerDraft() : ""));
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const check = useMutation({
    mutationFn: (value: string) => checkerApi.checkText(value),
    onSuccess: () => setIsEditing(false),
  });

  // A PDF is read first and its text shown in the text box, so you can see what will be checked before it is.
  const extract = useMutation({
    mutationFn: (file: File) => extractApi.fromPdf(file),
    onSuccess: (data, file) => {
      setText(data.text);
      setSourceNote(`Text read from ${file.name}. Check that it looks right and edit anything that doesn't, then run the check.`);
      setInputError(null);
      setTab("text");
    },
  });

  const words = useMemo(() => countWords(text), [text]);

  // A new result replaces the editor, so bring the report to the top of the view.
  const result = check.data;
  useEffect(() => {
    if (result) reportRef.current?.scrollIntoView({ block: "start" });
  }, [result]);

  // Coming back from signing in with text waiting: clear the bookmarks and run the check the visitor asked for.
  const resumed = useRef(false);
  useEffect(() => {
    if (!signedIn || resumed.current) return;
    resumed.current = true;
    clearReturnTo();
    const draft = readCheckerDraft();
    clearCheckerDraft();
    if (draft && countWords(draft) >= config.checker_min_words && draft.length <= config.checker_max_chars) check.mutate(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const minWords = config.checker_min_words;
  const maxChars = config.checker_max_chars;
  const overLimit = text.length > maxChars;
  const tooShort = words < minWords;
  const canRun = !tooShort && !overLimit && !check.isPending;
  const showReport = Boolean(result) && !isEditing && !check.isPending;

  /** Signed-out visitors can read and paste, but running a check needs an account: keep their text and send them to sign in. */
  const requireSignIn = (value: string) => {
    saveCheckerDraft(value);
    setReturnTo("/checker");
    router.push("/login");
  };

  const run = (value: string) => {
    setInputError(null);
    if (!signedIn) {
      requireSignIn(value);
      return;
    }
    check.mutate(value);
  };

  const loadSample = (index: number) => {
    const sample = SAMPLES[index];
    setTab("text");
    setText(sample.text);
    setSourceNote(sample.source);
    if (signedIn) run(sample.text);
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
    setSourceNote(null);
    if (!signedIn) {
      requireSignIn(text);
      return;
    }
    extract.mutate(file);
  };

  const handoff = () => {
    const handoffText = (result?.sentences ?? []).map((s) => s.text).join(" ");
    if (!handoffText.trim()) return;
    setHumanizerPrefill(handoffText);
    router.push("/humanizer");
  };

  const reset = () => {
    check.reset();
    extract.reset();
    setText("");
    setSourceNote(null);
    setInputError(null);
    setIsEditing(false);
  };

  const failure = extract.error ?? check.error;
  const errorMessage =
    inputError ?? (failure instanceof Error ? failure.message : failure ? "Something went wrong. Please try again." : null);

  const wordHint =
    words === 0
      ? `Paste at least ${minWords} words.`
      : tooShort
        ? `${words.toLocaleString()} ${words === 1 ? "word" : "words"}. Add ${(minWords - words).toLocaleString()} more to run the check.`
        : `${words.toLocaleString()} words`;

  let sideContent;
  if (check.isPending) {
    sideContent = <ResultSkeleton />;
  } else if (errorMessage) {
    const retryWith = !inputError && !extract.error ? check.variables : undefined;
    sideContent = <ErrorPanel message={errorMessage} onRetry={retryWith ? () => run(retryWith) : undefined} />;
  } else {
    sideContent = <HowToRead minWords={minWords} />;
  }

  return (
    <>
          {showReport && result ? (
            <div ref={reportRef} className="scroll-mt-4 space-y-4" aria-live="polite">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="order-last min-w-0 lg:order-first">
                  <AnnotatedDocument result={result} source={check.variables} />
                </div>
                <ReportBand result={result} onEdit={() => setIsEditing(true)} onReset={reset} onHumanize={handoff} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <section aria-label="Text to check" className="glass-card rounded-xl p-4">
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
                      {signedIn && <ImportControls onExtracted={(t) => setText(t)} disabled={check.isPending} />}
                    </div>
                    <textarea
                      id="checker-text"
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value);
                        setSourceNote(null);
                      }}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) run(text);
                      }}
                      placeholder="Paste the text you want to check…"
                      aria-describedby="checker-text-hint"
                      className="font-reading weight-normal min-h-[220px] w-full resize-y rounded-lg border border-[var(--border-subtle)] bg-transparent p-3.5 text-[15px] leading-[1.7] text-[var(--text-primary)] outline-none focus-accent placeholder:text-zinc-400 md:min-h-[300px]"
                    />
                    <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden>
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                          width: `${Math.min(100, (words / minWords) * 100)}%`,
                          backgroundColor: tooShort ? "var(--marketing-accent)" : "var(--verdict-human-fill)",
                        }}
                      />
                    </div>
                    <div id="checker-text-hint" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                      <span className="text-zinc-400">{sourceNote ?? wordHint}</span>
                      {(overLimit || text.length > maxChars * 0.8) && (
                        <span className={overLimit ? "text-[var(--verdict-ai)]" : "text-zinc-400"}>
                          {text.length.toLocaleString()} / {maxChars.toLocaleString()} characters
                          {overLimit ? ". Too long to check in one go." : ""}
                        </span>
                      )}
                    </div>
                    {sourceNote && <p className="mt-1 text-[12.5px] text-zinc-400">{wordHint}</p>}
                    {overLimit && (
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = trimToLimit(text, maxChars);
                          setText(trimmed);
                          setSourceNote(`Kept the first ${countWords(trimmed).toLocaleString()} words, the most that can be checked at once.`);
                        }}
                        className="mt-2 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--text-primary)] transition-colors hover-surface"
                      >
                        Keep only the first {maxChars.toLocaleString()} characters
                      </button>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-400">
                        <span>No text handy? Try a sample:</span>
                        {SAMPLES.map((sample, i) => (
                          <button
                            key={sample.id}
                            type="button"
                            onClick={() => loadSample(i)}
                            disabled={check.isPending}
                            className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-[12.5px] font-medium text-[var(--text-primary)] transition-colors hover-surface disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {sample.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => run(text)}
                        disabled={!canRun}
                        className="rounded-md px-5 py-2 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ backgroundColor: "var(--marketing-accent)" }}
                      >
                        {check.isPending ? "Checking…" : signedIn ? "Check text" : "Sign in to check"}
                      </button>
                    </div>
                    <p className="mt-2 text-right text-[12px] text-zinc-400">
                      {signedIn ? <span className="hidden md:inline">or press Ctrl or Cmd + Enter</span> : "A free account is needed to run a check. Your text is kept while you sign in."}
                    </p>
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
                    {extract.isPending ? (
                      <div className="flex min-h-[240px] flex-col justify-center gap-5 rounded-lg border border-[var(--border-medium)] px-6 py-8 md:min-h-[300px]">
                        <div>
                          <p className="truncate text-[14px] font-medium text-[var(--text-primary)]">{extract.variables?.name}</p>
                          <p className="text-[12.5px] text-zinc-400">
                            {extract.variables ? formatFileSize(extract.variables.size) : ""}
                          </p>
                        </div>
                        <ProgressNote label="Reading your PDF…" hint="Uploading it and pulling out the text. You'll see the text before anything is checked." />
                      </div>
                    ) : (
                      <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--border-medium)] px-6 text-center md:min-h-[300px]">
                        <p className="text-[14px] font-medium text-[var(--text-primary)]">Upload a PDF to check</p>
                        <p className="max-w-xs text-[12.5px] leading-relaxed text-zinc-400">
                          Up to {config.max_upload_size_mb} MB. The PDF needs selectable text; scanned pages without text
                          can&rsquo;t be read. We show you the text we read from it before checking.
                        </p>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={check.isPending}
                          className="rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ backgroundColor: "var(--marketing-accent)" }}
                        >
                          Choose a PDF
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <aside aria-label="Result" aria-live="polite" className="glass-card self-start rounded-xl p-4 lg:sticky lg:top-6">
                {sideContent}
              </aside>
            </div>
          )}
    </>
  );
}
