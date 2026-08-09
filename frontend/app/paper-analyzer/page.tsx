"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import { paperAnalyzerApi, type PaperAnalysisResult, type StyleGuide } from "@/services/api/paper-analyzer-api";
import { StylePicker } from "@/features/paper-analyzer/components/style-picker";
import { CheckRow } from "@/features/paper-analyzer/components/check-row";
import { ScanningPanel } from "@/features/paper-analyzer/components/scanning-panel";
import { AtmosphereBackground } from "@/features/shared/components/atmosphere-background";
import { CursorSpotlight, Glare, Reveal, Tilt3D } from "@/features/shared/motion/motion";
import { ProbabilityGauge } from "@/features/checker/components/probability-gauge";
import MainLayout from "@/components/layout/main-layout";
import { ProductShellSidebar } from "@/components/layout/product-shell-sidebar";

function gaugeColor(score: number): string {
  if (score >= 85) return "#34d399";
  if (score >= 50) return "#fbbf24";
  return "#f87171";
}

function IdleRail() {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-10 text-center">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 9h15M4.5 15h15" />
        </svg>
      </div>
      <p className="text-[14px] font-semibold text-[var(--text-primary)]">Awaiting a document</p>
      <p className="text-[12.5px] leading-relaxed text-zinc-500">
        Pick a style guide, then upload a PDF. Every check is measured directly from the page&apos;s real
        margins, spacing, font, and alignment — nothing guessed.
      </p>
    </div>
  );
}

function ResultRail({ result }: { result: PaperAnalysisResult }) {
  return (
    <div>
      <div className="flex flex-col items-center gap-2 border-b border-[var(--border-subtle)] pb-5">
        <ProbabilityGauge targetPct={Math.round(result.overall_score)} color={gaugeColor(result.overall_score)} label="Overall score" />
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">{result.style_guide}</p>
        <p className="text-[11.5px] text-zinc-500">{result.page_count} page{result.page_count === 1 ? "" : "s"} analyzed</p>
      </div>
      <div className="mt-4 space-y-3">
        {result.checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">{result.disclaimer}</p>
    </div>
  );
}

export default function PaperAnalyzerPage() {
  const { isReady, isAuthenticated } = useAuthGuard();
  const [style, setStyle] = useState<StyleGuide | null>(null);
  const [result, setResult] = useState<PaperAnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => paperAnalyzerApi.analyze(file, style as StyleGuide),
    onSuccess: setResult,
    onError: (err) => toast.error(err instanceof Error ? err.message : "Analysis failed"),
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

  const handleFilePicked = (file: File | undefined) => {
    if (!file) return;
    if (!style) {
      toast.error("Choose a style guide first");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are supported");
      return;
    }
    setResult(null);
    mutation.mutate(file);
  };

  return (
    <MainLayout
      sidebar={<ProductShellSidebar />}
      background={
        <>
          <AtmosphereBackground variant="calm" />
          <CursorSpotlight color="124,79,176" />
        </>
      }
    >
      <div className="relative h-full overflow-y-auto px-6 py-8">
        <div className="relative z-10 mx-auto max-w-6xl space-y-6">
          <Reveal>
            <Glare>
              <header className="glass-card flex items-center gap-3 rounded-2xl px-5 py-4">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 9h15M4.5 15h15" />
                  </svg>
                </div>
                <div>
                  <h1 className="font-headline text-xl font-bold tracking-tight text-[var(--text-primary)]">
                    Paper Analyzer
                  </h1>
                  <p className="mt-0.5 text-[13px] text-zinc-500">
                    Measures your document&apos;s real formatting against a style guide
                  </p>
                </div>
              </header>
            </Glare>
          </Reveal>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
            <Glare>
              <div className="glass-card space-y-5 rounded-2xl p-4">
                <StylePicker value={style} onChange={setStyle} />

                <div>
                  <p className="mb-2 text-[13px] font-medium text-[var(--text-primary)]">2. Upload your paper</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => handleFilePicked(e.target.files?.[0])}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={mutation.isPending || !style}
                    className="flex min-h-[280px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-subtle)] text-zinc-500 hover-surface disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                    </svg>
                    <span className="text-[13px]">
                      {mutation.isPending
                        ? "Analyzing…"
                        : style
                          ? "Click to upload a PDF"
                          : "Select a style guide to enable upload"}
                    </span>
                  </button>
                </div>
              </div>
            </Glare>

            <Tilt3D className="self-start lg:sticky lg:top-6">
              <Glare>
                <div className="glass-card rounded-2xl p-4">
                  {mutation.isPending ? <ScanningPanel /> : result ? <ResultRail result={result} /> : <IdleRail />}
                </div>
              </Glare>
            </Tilt3D>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
