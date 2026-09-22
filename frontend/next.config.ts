import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  turbopack: {},
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
