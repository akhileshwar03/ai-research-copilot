const RAW_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const API_BASE_URL = RAW_API_BASE_URL.replace(/\/$/, "");
export const API_V1_PREFIX = process.env.NEXT_PUBLIC_API_PREFIX || "";

if (typeof window !== "undefined" && !API_BASE_URL) {
  console.warn("NEXT_PUBLIC_API_URL is not configured");
}

export function buildApiUrl(path: string): string {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const prefix = API_V1_PREFIX ? (API_V1_PREFIX.startsWith("/") ? API_V1_PREFIX : `/${API_V1_PREFIX}`) : "";
  return `${API_BASE_URL}${prefix}${normalizedPath}`;
}

export function buildStaticUrl(path: string): string {
  if (!API_BASE_URL) {
    return "";
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
