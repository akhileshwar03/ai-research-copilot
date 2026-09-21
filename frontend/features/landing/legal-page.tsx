"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";
import { useAppConfig } from "@/features/shared/hooks/use-app-config";
import { SiteBackground } from "@/features/landing/site-background";
import { PageBackground } from "@/features/shared/components/page-background";

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
      />
    </svg>
  );
}

/** Renders admin-authored plain text as paragraphs, blank line = paragraph
 *  break — matches how it's edited in Settings → Legal & contact (a plain
 *  textarea, not a markdown editor), so what the admin typed is what shows. */
function ContentBody({ content }: { content: string }) {
  const paragraphs = content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="space-y-5">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-[14.5px] leading-7 text-zinc-600 whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

export function LegalPage({
  title,
  endpoint,
}: {
  title: string;
  endpoint: "/app/legal/privacy" | "/app/legal/terms";
}) {
  const { config } = useAppConfig();
  const { data, isLoading } = useQuery({
    queryKey: ["legal", endpoint],
    queryFn: () => apiRequest<{ content: string }>(endpoint, { skipAuth: true }),
    staleTime: 60_000,
  });

  const content = data?.content ?? "";

  return (
    <main className="marketing-light relative min-h-screen text-zinc-900">
      <PageBackground page="landing" dynamic={<SiteBackground />} />

      <div className="relative z-10">
        <nav className="glass-bar sticky top-0 z-40 border-b">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg shadow-md"
                style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
              >
                <SparkIcon className="h-4 w-4" />
              </div>
              <span className="font-headline text-[15px] font-bold tracking-tight">Querex</span>
            </Link>
            <Link href="/" className="text-[13px] font-medium text-zinc-500 transition hover:text-zinc-900">
              Back to home
            </Link>
          </div>
        </nav>

        <section className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="font-headline text-3xl font-bold tracking-tight text-zinc-900">{title}</h1>
          <p className="mt-2 text-[13px] text-zinc-400">{config.legal_entity_name}</p>

          <div className="mt-10">
            {isLoading ? (
              <div className="space-y-3">
                <div className="h-3.5 w-full animate-pulse rounded bg-zinc-200/70" />
                <div className="h-3.5 w-5/6 animate-pulse rounded bg-zinc-200/70" />
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-zinc-200/70" />
              </div>
            ) : content ? (
              <ContentBody content={content} />
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 px-6 py-10 text-center">
                <p className="text-[14px] text-zinc-500">
                  This page hasn&apos;t been published yet.
                </p>
                {config.support_email && (
                  <p className="mt-2 text-[13px] text-zinc-400">
                    Questions in the meantime?{" "}
                    <a href={`mailto:${config.support_email}`} className="underline transition hover:text-zinc-700">
                      {config.support_email}
                    </a>
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
