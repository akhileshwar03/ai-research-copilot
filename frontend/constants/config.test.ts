import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// API_BASE_URL/API_V1_PREFIX are computed once at module load from
// process.env, so each case sets the env vars and re-imports fresh via
// vi.resetModules() — importing normally would just reuse the first load's
// values for every test.
async function loadConfig() {
  vi.resetModules();
  return import("./config");
}

describe("buildApiUrl", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("joins base URL, prefix, and path", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.querex.app";
    process.env.NEXT_PUBLIC_API_PREFIX = "/api/v1";
    const { buildApiUrl } = await loadConfig();
    expect(buildApiUrl("/app/config")).toBe("https://api.querex.app/api/v1/app/config");
  });

  it("adds a leading slash to the path if missing", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.querex.app";
    process.env.NEXT_PUBLIC_API_PREFIX = "/api/v1";
    const { buildApiUrl } = await loadConfig();
    expect(buildApiUrl("app/config")).toBe("https://api.querex.app/api/v1/app/config");
  });

  it("strips a trailing slash from the configured base URL", async () => {
    // Real bug shape: a base URL with a trailing slash (an easy env-var typo)
    // would otherwise produce a double slash before the prefix.
    process.env.NEXT_PUBLIC_API_URL = "https://api.querex.app/";
    process.env.NEXT_PUBLIC_API_PREFIX = "/api/v1";
    const { buildApiUrl } = await loadConfig();
    expect(buildApiUrl("/app/config")).toBe("https://api.querex.app/api/v1/app/config");
  });

  it("works with no prefix configured", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.querex.app";
    process.env.NEXT_PUBLIC_API_PREFIX = "";
    const { buildApiUrl } = await loadConfig();
    expect(buildApiUrl("/health")).toBe("https://api.querex.app/health");
  });

  it("throws instead of silently building a broken URL when unconfigured", async () => {
    // Real production risk this guards: NEXT_PUBLIC_API_URL scoped to the
    // wrong Vercel environment, or missing on a preview build, must fail
    // loudly — not silently point a real visitor's browser at localhost
    // (the previous behavior, until this session).
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const { buildApiUrl } = await loadConfig();
    expect(() => buildApiUrl("/app/config")).toThrow("NEXT_PUBLIC_API_URL is not configured");
    vi.unstubAllEnvs();
  });
});
