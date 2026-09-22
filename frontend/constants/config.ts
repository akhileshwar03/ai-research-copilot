// 2026-09-22: no longer falls back to localhost:8000 when unset — that
// fallback meant a misconfigured deployment (NEXT_PUBLIC_API_URL scoped to
// the wrong Vercel environment, or missing on a preview build) would talk to
// localhost from a real visitor's browser instead of failing loudly. It's
// still only empty in genuinely broken configs; local dev always sets this
// via .env.local (see .env.example).
const RAW_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export const API_BASE_URL = RAW_API_BASE_URL.replace(/\/$/, "");
export const API_V1_PREFIX = process.env.NEXT_PUBLIC_API_PREFIX || "";

if (typeof window !== "undefined" && !API_BASE_URL) {
  console.error("NEXT_PUBLIC_API_URL is not configured — every API call will fail");
}

export function buildApiUrl(path: string): string {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const prefix = API_V1_PREFIX ? (API_V1_PREFIX.startsWith("/") ? API_V1_PREFIX : `/${API_V1_PREFIX}`) : "";
  return `${API_BASE_URL}${prefix}${normalizedPath}`;
}
