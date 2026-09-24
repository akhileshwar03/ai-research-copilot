import { defineConfig, devices } from "@playwright/test";

// 2026-09-24: real, full-stack browser tests — sign in, upload a document,
// get a grounded chat answer — as opposed to the Vitest unit tests (pure
// function/component logic) and the backend's own pytest suite (API
// contracts, no browser). Nothing here mocks the backend; both servers are
// started fresh per run, against a real local Postgres (not SQLite — the
// RAG pipeline categorically can't run on SQLite, see
// e2e/start-backend.sh's header comment for why and for one-time local
// setup), no port clash with a real dev session on 8010/3050.
//
// BACKEND_PORT is duplicated in package.json's "test:e2e" script
// (NEXT_PUBLIC_API_URL) — Next.js inlines NEXT_PUBLIC_* vars into the
// client bundle at `next build` time, not at `next start` runtime, so
// setting it in this file's frontend webServer `env` below (which only
// affects the already-built `next start` process) does nothing; the real
// build has to see it before this config ever runs. Change both together.
const BACKEND_PORT = 8099;
const FRONTEND_PORT = 3099;

export default defineConfig({
  testDir: "./e2e",
  // Real network round-trips (OpenAI chat + embeddings, real ingestion) —
  // a tight unit-test-style timeout flakes under normal latency variance.
  timeout: 90_000,
  fullyParallel: false,
  // All tests share one backend instance/database (see webServer below) —
  // true concurrent workers means concurrent test files racing the same
  // DB and the same rate limits, not proper isolation. Force serial.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "bash e2e/start-backend.sh",
      cwd: __dirname,
      env: {
        BACKEND_PORT: String(BACKEND_PORT),
        FRONTEND_PORT: String(FRONTEND_PORT),
      },
      port: BACKEND_PORT,
      reuseExistingServer: false,
      timeout: 45_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // Deliberately just `next start`, no env override here — see the
      // BACKEND_PORT comment above for why that wouldn't work anyway. The
      // build that produced .next/ (triggered by "test:e2e" in
      // package.json, which runs before Playwright touches this file) is
      // what actually has to have NEXT_PUBLIC_API_URL set correctly.
      command: `npm run start -- -p ${FRONTEND_PORT}`,
      cwd: __dirname,
      port: FRONTEND_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
