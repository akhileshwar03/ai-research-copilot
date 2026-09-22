import * as Sentry from "@sentry/nextjs";

// 2026-09-22: no-op when NEXT_PUBLIC_SENTRY_DSN is unset — Sentry.init with
// an empty dsn disables the SDK entirely (its own documented behavior), so
// this ships safely before anyone creates a Sentry account. Sign up at
// sentry.io, create a Next.js project, and set the env var to enable it.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
