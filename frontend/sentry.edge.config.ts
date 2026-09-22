import * as Sentry from "@sentry/nextjs";

// Same no-op-when-unset behavior, for the Edge runtime (middleware, edge
// route handlers) — Next.js loads this one separately from the Node config.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
