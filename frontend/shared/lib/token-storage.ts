const ACCESS_TOKEN_KEY = "token";
// Legacy key: refresh tokens used to be persisted here. They now live in an
// httpOnly cookie (XSS cannot read those). We still READ the legacy key so
// sessions created before the migration keep working, but we never write it.
const LEGACY_REFRESH_TOKEN_KEY = "refresh_token";
const TOKEN_TYPE_KEY = "token_type";

export interface StoredTokens {
  accessToken: string | null;
  /** Legacy localStorage refresh token — null for sessions created after the cookie migration. */
  refreshToken: string | null;
  tokenType: string;
}

export function getStoredTokens(): StoredTokens {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null, tokenType: "bearer" };
  }
  return {
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: localStorage.getItem(LEGACY_REFRESH_TOKEN_KEY),
    tokenType: localStorage.getItem(TOKEN_TYPE_KEY) || "bearer",
  };
}

export function setStoredTokens(tokens: { accessToken: string; tokenType?: string | null }): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.tokenType) {
    localStorage.setItem(TOKEN_TYPE_KEY, tokens.tokenType);
  }
}

export function clearStoredTokens(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_TYPE_KEY);
}

export function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64Payload = token.split(".")[1];
    const payload = atob(base64Payload);
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getUserEmailFromToken(token: string | null): string | null {
  if (!token) {
    return null;
  }
  const decoded = parseJwt(token);
  const sub = decoded?.sub;
  return typeof sub === "string" ? sub : null;
}

export function isTokenExpired(token: string | null): boolean {
  if (!token) {
    return true;
  }
  const decoded = parseJwt(token);
  const exp = decoded?.exp;
  if (typeof exp !== "number") {
    return true;
  }
  return Math.floor(Date.now() / 1000) >= exp;
}
