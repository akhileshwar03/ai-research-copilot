import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// Baseline browser-security headers (2026-10-14 security review: the site sent only HSTS).
// Deliberately NOT here: Content-Security-Policy and Permissions-Policy. Both are easy to get
// subtly wrong and break a working app (this one uses the microphone for Real-time AI, loads
// Sentry, and uses Google Fonts), and neither can be verified without a full browser pass.
// Add them as a separate, tested change rather than guessing.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" }, // no iframes anywhere in the app
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  turbopack: {},
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
