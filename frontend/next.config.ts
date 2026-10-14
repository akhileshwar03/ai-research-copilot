import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// Browser-security headers (2026-10-14 security review: the site sent only HSTS).
//
// Content-Security-Policy is an allow-list of where the page may load things from. It is built from
// what this app ACTUALLY uses (audited in the source, not guessed): fonts are self-hosted at build
// time by next/font; images are the logo/backgrounds served by the API plus a data: SVG texture and
// blob: previews; the PDF viewer's worker is a bundled same-origin file; network calls go only to
// the API and Sentry. The API origin and Sentry host come from the same build-time env vars the app
// itself reads, so nothing is hardcoded here.
//
// script-src keeps 'unsafe-inline' because Next.js hydration relies on inline scripts; removing it
// needs per-request nonces, which forces every page to render dynamically - a much bigger change.
// So this policy does NOT stop inline-script XSS. It does stop: loading scripts or plugins from
// other origins, framing the app, <base> / form hijacking, and sending data to any host that isn't
// the API or Sentry.
//
// Ships as Report-Only first (CSP_ENFORCE=false): the browser logs violations but blocks nothing, so
// every page can be exercised on the real site before it is allowed to break anything.
const CSP_ENFORCE = true;

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function contentSecurityPolicy(): string | null {
  // Dev server needs eval/websockets for hot reload; the policy is only for real builds.
  if (process.env.NODE_ENV !== "production") return null;
  const api = originOf(process.env.NEXT_PUBLIC_API_URL);
  const sentry = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const list = (...parts: (string | null)[]) => parts.filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${list("'self'", "data:", "blob:", api)}`,
    "font-src 'self' data:",
    // blob: is required: the chat passes a blob: URL to the PDF viewer (app/chat/page.tsx
    // file={pdfBlobUrl}), so pdf.js FETCHES a blob: address, which connect-src governs. Found by
    // testing on the live Report-Only policy - fetching a blob: URL raised connect-src violations;
    // enforcing without it would have broken PDF viewing. These URLs are minted by the page itself
    // from bytes it already got from the API, so allowing them adds no outside host.
    `connect-src ${list("'self'", "blob:", api, sentry)}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// Nothing in the app uses the camera, microphone, location, payments or USB (verified by search -
// "Real-time AI" is a streaming web-search chat, not voice), so they are switched off outright.
const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" }, // no iframes anywhere in the app
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
];

const nextConfig: NextConfig = {
  turbopack: {},
  async headers() {
    const csp = contentSecurityPolicy();
    const headers = csp
      ? [
          ...securityHeaders,
          { key: CSP_ENFORCE ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
        ]
      : securityHeaders;
    return [{ source: "/:path*", headers }];
  },
};

// withSentryConfig is safe to apply unconditionally: without SENTRY_AUTH_TOKEN
// it simply skips source-map upload (no build-time network calls to Sentry),
// and the SDK itself no-ops at runtime without NEXT_PUBLIC_SENTRY_DSN — see
// sentry.{client,server,edge}.config.ts. v10.75.2 has real Turbopack support
// (this project builds with Turbopack — see the `turbopack: {}` above).
export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
});
