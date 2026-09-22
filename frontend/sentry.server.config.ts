import * as Sentry from "@sentry/nextjs";

// Same no-op-when-unset behavior as sentry.client.config.ts, for errors
// thrown during server-side rendering / route handlers / server actions.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
