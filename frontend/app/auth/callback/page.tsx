"use client";

/**
 * OAuth callback handler.
 * The backend redirects here after a successful OAuth exchange:
 *   /auth/callback?token=xxx&refresh_token=xxx&is_new_user=true/false
 *
 * This page stores the tokens, updates auth state, and redirects to /chat.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { setStoredTokens, getUserEmailFromToken } from "@/shared/lib/token-storage";
import { useAuthStore } from "@/stores/auth-store";

function AuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const token = params.get("token");
    const refreshToken = params.get("refresh_token");
    const error = params.get("error");

    if (error) {
      const messages: Record<string, string> = {
        google_auth_failed: "Google sign-in failed. Please try again.",
        facebook_auth_failed: "Facebook sign-in failed. Please try again.",
        no_email: "We couldn't get your email from this provider. Try email sign-in instead.",
      };
      setErrorMsg(messages[error] || "Authentication failed. Please try again.");
      setStatus("error");
      return;
    }

    if (!token) {
      setErrorMsg("No authentication token received. Please try again.");
      setStatus("error");
      return;
    }

    // Store tokens
    setStoredTokens({
      accessToken: token,
      refreshToken: refreshToken || null,
      tokenType: "bearer",
    });

    // Update auth store
    setAuth({
      accessToken: token,
      refreshToken: refreshToken || null,
      tokenType: "bearer",
      email: getUserEmailFromToken(token),
    });

    // Redirect to workspace
    router.replace("/chat");
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
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--app-bg)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
        <p className="text-[13px] text-zinc-600">Completing sign-in…</p>
      </div>
    }>
      <AuthCallbackInner />
    </Suspense>
  );
}
