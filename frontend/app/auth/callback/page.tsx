"use client";

/**
 * OAuth callback handler.
 *
 * Security: the backend no longer embeds tokens in the redirect URL.
 * Instead it generates a short-lived, single-use code and sends only that
 * code here. This page exchanges the code for tokens via a POST request so
 * that JWTs never appear in URLs, browser history, or server logs.
 *
 * Flow:
 *   Backend OAuth callback → redirect to /auth/callback?code=<one-time-code>
 *   This page calls POST /auth/oauth/exchange with the code
 *   Receives tokens, stores them, redirects to /chat
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { apiRequest } from "@/services/api/client";
import { setStoredTokens, getUserEmailFromToken } from "@/shared/lib/token-storage";
import { useAuthStore } from "@/stores/auth-store";

interface ExchangeResponse {
  access_token?: string;
  token?: string;
  refresh_token?: string;
  token_type?: string;
  is_new_user?: boolean;
}

function AuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const code = params.get("code");
    const error = params.get("error");

    if (error) {
      const messages: Record<string, string> = {
        google_auth_failed: "Google sign-in failed. Please try again.",
        github_auth_failed: "GitHub sign-in failed. Please try again.",
        no_email: "We couldn't get your email from this provider. Try email sign-in instead.",
      };
      setErrorMsg(messages[error] ?? "Authentication failed. Please try again.");
      setStatus("error");
      return;
    }

    if (!code) {
      setErrorMsg("No authentication code received. Please try again.");
      setStatus("error");
      return;
    }

    // Exchange the one-time code for tokens — keeps JWTs out of the URL.
    // credentials:include lets the backend set the httpOnly refresh cookie.
    apiRequest<ExchangeResponse>("/auth/oauth/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
      credentials: "include",
      skipAuth: true,
    })
      .then((data) => {
        const accessToken = data.access_token ?? data.token ?? "";
        const refreshToken = data.refresh_token ?? null;
        const tokenType = data.token_type ?? "bearer";

        // Refresh token stays in the httpOnly cookie + memory only.
        setStoredTokens({ accessToken, tokenType });
        setAuth({
          accessToken,
          refreshToken,
          tokenType,
          email: getUserEmailFromToken(accessToken),
        });

        router.replace("/chat");
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Token exchange failed";
        setErrorMsg(message);
        setStatus("error");
      });
  }, [params, router, setAuth]);

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--app-bg)] px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
          <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-[15px] font-medium text-white">Sign-in failed</p>
          <p className="mt-1 text-[13px] text-zinc-500">{errorMsg}</p>
        </div>
        <button
          onClick={() => router.replace("/login")}
          className="mt-2 rounded-xl bg-white px-6 py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--app-bg)]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
      <p className="text-[13px] text-zinc-600">Completing sign-in…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  const loadingFallback = (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--app-bg)]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
      <p className="text-[13px] text-zinc-600">Completing sign-in…</p>
    </div>
  );

  return <Suspense fallback={loadingFallback}><AuthCallbackInner /></Suspense>;
}
