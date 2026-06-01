"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_auth_failed: "Google sign-in failed. Please try again.",
  facebook_auth_failed: "Facebook sign-in failed. Please try again.",
  no_email: "Could not retrieve your email from this provider. Try email sign-in.",
};

import { useAuth } from "@/features/auth/hooks/use-auth";
import { OtpInput } from "@/components/ui/otp-input";

// ─── Icons ─────────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

// ─── Countdown ─────────────────────────────────────────────────────────────────

function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const start = () => {
    setRemaining(seconds);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setRemaining((r) => { if (r <= 1) { clearInterval(timer.current!); return 0; } return r - 1; });
    }, 1000);
  };
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  return { remaining, start };
}

// ─── Page ──────────────────────────────────────────────────────────────────────

type Step = "email" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isReady, sendOtp, verifyOtp, isSendingOtp, isVerifyingOtp, oauthProviders } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { remaining, start: startCountdown } = useCountdown(60);

  useEffect(() => {
    if (isReady && isAuthenticated) router.replace("/chat");
  }, [isReady, isAuthenticated, router]);

  // Show OAuth error toasts from redirect params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      toast.error(OAUTH_ERROR_MESSAGES[err] ?? "Sign-in failed. Please try again.", { duration: 5000 });
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  // ── OAuth ──────────────────────────────────────────────────────────────────
  const handleOAuth = (provider: "google" | "github") => {
    if (!oauthProviders[provider]) {
      toast.info(`${provider.charAt(0).toUpperCase() + provider.slice(1)} sign-in is not configured yet. Use email below.`, { duration: 4000 });
      return;
    }
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    window.location.href = `${base}/auth/oauth/${provider}`;
  };

  // ── Send OTP ───────────────────────────────────────────────────────────────
  const handleSendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address"); return; }
    try {
      const result = await sendOtp({ email: email.trim() });
      setDevCode(result._dev_code ?? null);
      if (result._dev_code) setOtp(result._dev_code);
      setStep("otp");
      startCountdown();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    }
  };

  // ── Verify OTP ─────────────────────────────────────────────────────────────
  const handleVerifyOtp = async (completedValue?: string) => {
    setError("");
    const code = completedValue ?? otp;
    if (code.replace(/\s/g, "").length < 6) return;
    try {
      await verifyOtp({ email: email.trim(), code });
      router.replace("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired code");
      setOtp("");
      setDevCode(null);
    }
  };

  const isLoading = isSendingOtp || isVerifyingOtp;

  const providers = [
    { key: "google" as const, label: "Google", icon: <GoogleIcon /> },
    { key: "github" as const, label: "GitHub", icon: <GitHubIcon /> },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 left-1/2 h-96 w-[600px] -translate-x-1/2 rounded-full bg-white/[0.015] blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-[var(--border-medium)]">
            <svg className="h-5 w-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <h1 className="text-[17px] font-semibold text-[var(--text-primary)]">Querex</h1>
          <p className="mt-1 text-[12px] text-zinc-500">Your intelligent research workspace</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--login-card)] shadow-2xl">
          <div className="p-6">

            {/* ── Email step ──────────────────────────────────────────────── */}
            {step === "email" && (
              <div className="space-y-4">
                {/* Social buttons */}
                <div className="space-y-2">
                  {providers.map(({ key, label, icon }) => {
                    const configured = oauthProviders[key];
                    return (
                      <button
                        key={key}
                        onClick={() => handleOAuth(key)}
                        className={[
                          "flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-[13px] font-medium transition",
                          configured
                            ? "border-white/[0.08] bg-white/[0.03] text-zinc-200 hover:border-white/[0.14] hover:bg-white/[0.06]"
                            : "border-white/[0.04] bg-transparent text-zinc-600 hover:border-white/[0.08] hover:text-zinc-500",
                        ].join(" ")}
                      >
                        <span className={configured ? "opacity-100" : "opacity-30"}>{icon}</span>
                        <span>Continue with {label}</span>
                        {!configured && (
                          <span className="ml-auto rounded-full border border-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-700">
                            not configured
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="text-[11px] text-zinc-600">or continue with email</span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>

                <form onSubmit={handleSendOtp} className="space-y-3">
                  <input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    autoComplete="email"
                    className="w-full rounded-xl border border-[var(--border-medium)] bg-white/[0.03] px-4 py-2.5 text-[13px] text-[var(--text-primary)] placeholder-zinc-600 outline-none transition focus:border-[var(--border-strong)] focus:bg-white/[0.05]"
                  />
                  {error && <p className="text-[12px] text-red-400">{error}</p>}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full rounded-xl bg-white py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-50"
                  >
                    {isSendingOtp ? "Sending…" : "Continue with Email"}
                  </button>
                </form>
              </div>
            )}

            {/* ── OTP step ────────────────────────────────────────────────── */}
            {step === "otp" && (
              <div className="space-y-5">
                <button
                  onClick={() => { setStep("email"); setOtp(""); setError(""); setDevCode(null); }}
                  className="flex items-center gap-1.5 text-[12px] text-zinc-600 transition hover:text-zinc-300"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>

                <div>
                  <p className="text-[15px] font-semibold text-white">Check your email</p>
                  <p className="mt-1 text-[12px] text-zinc-500">
                    We sent a 6-digit code to <span className="text-zinc-300">{email}</span>
                  </p>
                </div>

                {devCode && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <div>
                      <p className="text-[11px] font-medium text-amber-400">Dev mode — email not sent</p>
                      <p className="text-[11px] text-amber-600">Code auto-filled: <span className="font-mono font-bold text-amber-400">{devCode}</span></p>
                      <p className="mt-0.5 text-[10px] text-amber-700">Set RESEND_API_KEY on Render to send real emails.</p>
                    </div>
                  </div>
                )}

                <OtpInput
                  length={6}
                  value={otp}
                  onChange={(v) => { setOtp(v); setError(""); }}
                  onComplete={handleVerifyOtp}
                />

                {error && <p className="text-center text-[12px] text-red-400">{error}</p>}

                <button
                  onClick={() => handleVerifyOtp()}
                  disabled={isVerifyingOtp || otp.replace(/\s/g, "").length < 6}
                  className="w-full rounded-xl bg-white py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-50"
                >
                  {isVerifyingOtp ? "Verifying…" : "Sign In"}
                </button>

                <div className="text-center text-[12px] text-zinc-600">
                  {remaining > 0 ? (
                    <span>Resend in {remaining}s</span>
                  ) : (
                    <button
                      onClick={() => { setOtp(""); setDevCode(null); setError(""); void handleSendOtp(); }}
                      disabled={isSendingOtp}
                      className="text-zinc-400 underline underline-offset-2 hover:text-zinc-200 disabled:opacity-50"
                    >
                      {isSendingOtp ? "Sending…" : "Resend code"}
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="border-t border-[var(--border-subtle)] px-6 py-3 text-center">
            <p className="text-[11px] text-zinc-700">
              By continuing you agree to our{" "}
              <span className="cursor-pointer text-zinc-500 underline underline-offset-2">Terms</span>
              {" "}&{" "}
              <span className="cursor-pointer text-zinc-500 underline underline-offset-2">Privacy</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
