import { buildApiUrl } from "@/constants/config";
import { clearStoredTokens, getStoredTokens, isTokenExpired, setStoredTokens } from "@/shared/lib/token-storage";
import type { ApiError, RefreshResponse } from "@/shared/types/api";

const JSON_HEADERS = { "Content-Type": "application/json" };

type RequestOptions = RequestInit & {
  skipAuth?: boolean;
  skipRefresh?: boolean;
};

async function tryRefreshToken(): Promise<string | null> {
  const { refreshToken } = getStoredTokens();
  if (!refreshToken) {
    return null;
  }

  const refreshUrl = buildApiUrl("/refresh");
  const response = await fetch(refreshUrl, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ refresh_token: refreshToken }),
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

async function parseError(response: Response): Promise<never> {
  let payload: ApiError | null = null;
  try {
    payload = (await response.json()) as ApiError;
  } catch {
    payload = null;
  }

  const message = payload?.error?.message || payload?.detail || `Request failed: ${response.status}`;
  throw new Error(message);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth, skipRefresh, headers, ...rest } = options;
  const { accessToken, tokenType } = getStoredTokens();

  const requestHeaders = new Headers(headers || {});
  if (!requestHeaders.get("Content-Type") && !(rest.body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }

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
      return apiRequest<T>(path, { ...options, skipRefresh: true });
    }
  }

  if (!response.ok) {
    return parseError(response);
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

  return response;
}
