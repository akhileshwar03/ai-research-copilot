import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Querex — AI Research Workspace",
  description: "AI-powered research workspace for PDFs and documents",
};

// Inline script: reads the saved theme from localStorage and applies the
// `light-theme` class to <html> BEFORE the first paint, preventing FOUC.
const themeInitScript = `(function(){try{var t=localStorage.getItem('pf_theme');if(t==='light')document.documentElement.classList.add('light-theme');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Runs before React hydrates — prevents light/dark flash on reload (FOUC fix) */}
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
