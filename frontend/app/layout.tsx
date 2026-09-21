import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, Bricolage_Grotesque, Public_Sans, Space_Mono } from "next/font/google";
import Script from "next/script";

import { AppProviders } from "@/providers/app-providers";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial display serif — used only for the marketing headline, paired
// against Geist Sans everywhere else, so the landing page reads as designed
// rather than another "all-Geist" AI-startup template.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
});

// Cinematic UI system (app-wide, everywhere except the marketing hero above):
// Bricolage Grotesque for headline-scale text, Public Sans for body, Space
// Mono for the handful of real numeral readouts (AI-probability gauge,
// readability score).
const bricolageGrotesque = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

// 2026-09-21: real, reported issue — Google's search snippet was showing
// "Vercel" as the site name and the raw *.vercel.app deploy URL instead of
// "Querex", with Vercel's own triangle logo as the favicon. Root cause: no
// favicon anywhere in the app (fixed by app/icon.svg, picked up by Next's
// file convention) and no metadataBase/openGraph/site-name here, so crawlers
// fell back to the hosting platform's own defaults. 2026-09-21: querex.app
// is now live on Vercel (querex.app 307-redirects to www.querex.app, which
// is Production) — that's the real canonical domain now, not a fallback.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.querex.app";
const SITE_TITLE = "Querex — AI Tools for Research & Writing";
const SITE_DESCRIPTION =
  "Ask your documents with page-cited answers, rewrite AI-sounding text, detect AI-generated content, and search the live web — four AI tools, one account.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Querex",
  robots: { index: true, follow: true },
  // 2026-09-21: without this, Google has no signal that querex.app (not the
  // ai-research-copilot-kappa.vercel.app it's already indexed) is the URL to
  // treat as authoritative — metadataBase alone doesn't emit a canonical tag.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Querex",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

// Inline script: applies the theme BEFORE first paint, preventing FOUC.
// Light is the default; dark only when explicitly chosen, "system" follows
// the OS preference.
const themeInitScript = `(function(){try{var t=localStorage.getItem('pf_theme');var dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(!dark)document.documentElement.classList.add('light-theme');}catch(e){document.documentElement.classList.add('light-theme');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${bricolageGrotesque.variable} ${publicSans.variable} ${spaceMono.variable} h-full antialiased`}
      // The theme script adds `light-theme` to <html> before hydration —
      // an intentional, attribute-only mismatch (standard theming pattern).
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Runs before React hydrates — prevents light/dark flash on reload (FOUC fix) */}
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
