"use client";

import Link from "next/link";
import { useLayoutEffect, useSyncExternalStore } from "react";

import MainLayout from "@/components/layout/main-layout";
import { getStoredTokens } from "@/shared/lib/token-storage";
import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import { CheckerHero } from "@/features/checker/components/checker-hero";
import { CheckerBackground } from "@/features/checker/components/checker-background";
import { CheckerExplainer } from "@/features/checker/components/checker-explainer";
import { CheckerWorkspace } from "@/features/checker/components/checker-workspace";
import { GithubNavLink } from "@/features/landing/github-nav-link";
import { FooterCopyright, SupportEmailLink } from "@/features/landing/footer-dynamic";
import { LandingFooter, LandingNav } from "@/features/landing/landing-chrome";
import { SiteBackground } from "@/features/landing/site-background";
import { PageBackground } from "@/features/shared/components/page-background";

/** True on the client when this browser already holds a sign-in. The server (and the first client render, which has
 *  to match it) say false. */
function useLikelySignedIn() {
  return useSyncExternalStore(
    () => () => {},
    () => Boolean(getStoredTokens().accessToken),
    () => false,
  );
}

/** The tool and its explanation on one page. Signed-in users get the app's own frame; visitors get the public one
 *  (same content), and are asked to sign in only when they press Check. */
export default function CheckerPage() {
  const { isReady, isAuthenticated } = useAuthGuard({ redirect: false });
  const likelySignedIn = useLikelySignedIn();

  // While we don't yet know who is here, show the public page: it is what the server sends, so search engines read
  // the real text straight away. Someone who is probably signed in sees a spinner instead of a flash of it.
  if (!isReady) return likelySignedIn ? <Spinner /> : <PublicShell />;
  return isAuthenticated ? <AppShell /> : <PublicShell />;
}

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--app-bg)]">
      <div
        className="h-6 w-6 animate-spin rounded-full border-2"
        style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--marketing-accent)" }}
      />
    </div>
  );
}

function Heading() {
  return (
    <header>
      <h1 className="font-headline text-[22px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">AI Checker</h1>
      <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-zinc-300">See whether a text reads as human-written, AI-written or a mix, sentence by sentence.</p>
    </header>
  );
}

/** A slim ending for the signed-in page, so it closes the way the public page does. */
function AppFooter() {
  const link = "transition-opacity hover:opacity-100";
  return (
    <footer className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-[var(--border-subtle)] pt-6 text-[12.5px] text-zinc-400">
      <FooterCopyright />
      <nav aria-label="Legal and contact" className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Link href="/privacy" className={link}>
          Privacy Policy
        </Link>
        <Link href="/terms" className={link}>
          Terms of Service
        </Link>
        <SupportEmailLink className={link} />
        <GithubNavLink className={link} />
      </nav>
    </footer>
  );
}

function AppShell() {
  return (
    <MainLayout background={<PageBackground page="checker" dynamic={<CheckerBackground />} />}>
      <div className="relative h-full overflow-y-auto px-4 py-6 md:px-6">
        <div className="relative z-10 mx-auto max-w-6xl space-y-4 pb-16">
          <Heading />
          <CheckerWorkspace signedIn />
          <CheckerExplainer signedIn />
          <AppFooter />
        </div>
      </div>
    </MainLayout>
  );
}

function PublicShell() {
  // The public pages are always light. Switch the theme class on while this page is open, so the shared tool
  // (which reads the app's theme colours) matches, and put it back for the signed-in app.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const had = root.classList.contains("light-theme");
    root.classList.add("light-theme");
    return () => {
      if (!had) root.classList.remove("light-theme");
    };
  }, []);

  return (
    <main className="marketing-light relative min-h-screen text-zinc-900">
      <PageBackground page="landing" dynamic={<SiteBackground />} />
      {/* The public nav is sticky, so anything that sticks below it has to start under it. */}
      <div className="relative z-10" style={{ "--sticky-top": "5.5rem" } as React.CSSProperties}>
        <LandingNav active="AI Checker" signInReturnTo="/checker" />
        <div className="mx-auto max-w-6xl space-y-6 px-4 pb-20 pt-8 md:px-6 md:pt-10">
          <CheckerHero />
          <CheckerWorkspace signedIn={false} />
          <CheckerExplainer signedIn={false} />
        </div>
        <LandingFooter />
      </div>
    </main>
  );
}
