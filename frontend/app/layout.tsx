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

export const metadata: Metadata = {
  title: "Querex — AI Tools for Research & Writing",
  description:
    "Ask your documents with page-cited answers, rewrite AI-sounding text, detect AI-generated content, and search the live web — four AI tools, one account.",
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
