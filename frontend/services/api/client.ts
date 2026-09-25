import * as Sentry from "@sentry/nextjs";

import { buildApiUrl } from "@/constants/config";
import { clearStoredTokens, getStoredTokens, isTokenExpired, setStoredTokens } from "@/shared/lib/token-storage";
import type { ApiError, RefreshResponse } from "@/shared/types/api";

const JSON_HEADERS = { "Content-Type": "application/json" };

type RequestOptions = RequestInit & {
  skipAuth?: boolean;
  skipRefresh?: boolean;
  /** Internal — set on the recursive retry-after-refresh call so the retry
   *  is tagged with the same request_id as the original attempt, matching
   *  the backend's own view that this is one logical request, not two.
   *  Callers should never set this themselves. */
  requestId?: string;
};

/** X-Request-ID a client-supplied value the backend already knows how to
 * accept and echo back (see backend/app/api/middleware/request_context.py's
 * _SAFE_REQUEST_ID check) — generating it here rather than only on the
 * backend is what lets a Sentry error captured in the browser and the
 * backend request that served it be found by the same id, instead of two
 * unrelated-looking events on either side of the network. */
function newRequestId(): string {
  return crypto.randomUUID();
}

/** Reports a failed API call to Sentry tagged with the exact request_id
 * sent to the backend — scoped via withScope so this never leaks onto an
 * unrelated concurrent request's Sentry event. Best-effort: failures here
 * must never affect the actual request's own error handling. */
function reportApiError(path: string, requestId: string, error: unknown): void {
  try {
    Sentry.withScope((scope) => {
      scope.setTag("request_id", requestId);
      scope.setContext("api_request", { path });
      Sentry.captureException(error);
    });
  } catch {
    // Never let Sentry reporting itself break the caller's error handling.
  }
}

async function tryRefreshToken(): Promise<string | null> {
  // Primary channel: the httpOnly refresh cookie (sent via credentials:include).
  // Fallback: a legacy localStorage refresh token from pre-migration sessions,
  // or Safari where cross-site cookies are blocked.
  const { refreshToken } = getStoredTokens();

  const refreshUrl = buildApiUrl("/refresh");
  const response = await fetch(refreshUrl, {
    method: "POST",
    headers: JSON_HEADERS,
    credentials: "include",
    body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
  });

  if (!response.ok) {
    clearStoredTokens();
    return null;
  }

  const data = (await response.json()) as RefreshResponse;
  const accessToken = data.access_token || data.token;
  if (!accessToken) {
    clearStoredTokens();
    return null;
  }

  setStoredTokens({ accessToken, tokenType: data.token_type || "bearer" });
  return accessToken;
}

async function parseError(response: Response, path: string, requestId: string): Promise<never> {
  let payload: ApiError | null = null;
  try {
    payload = (await response.json()) as ApiError;
  } catch {
    payload = null;
  }

  const message = payload?.error?.message || payload?.detail || `Request failed: ${response.status}`;
  const error = new Error(message);
  reportApiError(path, requestId, error);
  throw error;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth, skipRefresh, headers, requestId: incomingRequestId, ...rest } = options;
  const requestId = incomingRequestId ?? newRequestId();
  const { accessToken, tokenType } = getStoredTokens();

  const requestHeaders = new Headers(headers || {});
  if (!requestHeaders.get("Content-Type") && !(rest.body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }
  requestHeaders.set("X-Request-ID", requestId);

  if (!skipAuth && accessToken) {
    requestHeaders.set("Authorization", `${tokenType} ${accessToken}`);
  }

  const response = await fetch(buildApiUrl(path), {
    ...rest,
    headers: requestHeaders,
  });

  if (response.status === 401 && !skipAuth && !skipRefresh) {
    const refreshedToken = await tryRefreshToken();
    if (refreshedToken) {
      return apiRequest<T>(path, { ...options, skipRefresh: true, requestId });
    }
  }

  if (!response.ok) {
    return parseError(response, path, requestId);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * Like apiRequest but returns the raw Response for streaming.
 * Includes the same proactive + reactive token-refresh logic as apiRequest
 * so that expired access tokens don't silently kill streams.
 */
export async function apiStream(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  // Generated once, reused for both the initial attempt and the 401-retry
  // below — they're the same logical request from the caller's/backend's
  // point of view, not two separate ones.
  const requestId = newRequestId();
  let { accessToken, tokenType } = getStoredTokens();

  // Proactive refresh: if the stored token is already expired, refresh before sending
  if (isTokenExpired(accessToken)) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      accessToken = refreshed;
      tokenType = "bearer";
    }
  }

  const makeRequest = (token: string | null, type: string) => {
    const headers = new Headers(JSON_HEADERS);
    headers.set("X-Request-ID", requestId);
    if (token) headers.set("Authorization", `${type} ${token}`);
    return fetch(buildApiUrl(path), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
  };

  const response = await makeRequest(accessToken, tokenType);

  // Reactive refresh: token was valid when checked but expired between now and the request
  if (response.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return makeRequest(refreshed, "bearer");
    }
  }

  // apiStream has always just returned the Response either way — callers
  // (use-streaming-chat.ts etc.) already parse SSE `error` frames from a
  // 200 stream themselves, so a non-ok top-level status is the only failure
  // shape worth reporting here, and only as a best-effort Sentry report,
  // never by throwing (that would be a real behavior change these callers
  // don't expect).
  if (!response.ok) {
    reportApiError(path, requestId, new Error(`Stream request failed: ${response.status}`));
  }

  return response;
}
