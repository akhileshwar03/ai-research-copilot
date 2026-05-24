"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAuth } from "@/features/auth/hooks/use-auth";
import { OtpInput } from "@/components/ui/otp-input";

// ─── Icons ────────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg className="h-4 w-4" fill="#1877F2" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "landing" | "otp" | "set-password";

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    setRemaining(seconds);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(timer.current!); return 0; }
        return r - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  return { remaining, start };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const {
    isAuthenticated, isReady,
    sendOtp, verifyOtp,
    isSendingOtp, isVerifyingOtp,
    oauthProviders,
  } = useAuth();

  const [step, setStep] = useState<Step>("landing");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const { remaining, start: startCountdown } = useCountdown(60);

  useEffect(() => {
    if (isReady && isAuthenticated) router.replace("/chat");
  }, [isReady, isAuthenticated, router]);

  // ── OAuth ──────────────────────────────────────────────────────────────────

  const handleOAuthClick = (provider: "google" | "apple" | "facebook") => {
    const isConfigured = oauthProviders[provider];
    if (!isConfigured) {
      toast.info(`${provider.charAt(0).toUpperCase() + provider.slice(1)} sign-in isn't configured yet. Use email OTP below.`, {
        duration: 4000,
      });
      return;
    }
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    window.location.href = `${base}/auth/oauth/${provider}`;
  };

  // ── OTP send ───────────────────────────────────────────────────────────────

  const handleSendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address");
      return;
    }
    try {
      const result = await sendOtp({ email: trimmed });
      setDevCode(result._dev_code ?? null);
      // Auto-fill OTP in dev mode
      if (result._dev_code) {
        setOtp(result._dev_code);
      }
      setStep("otp");
      startCountdown();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    }
  };

  // ── OTP verify ─────────────────────────────────────────────────────────────

  const handleVerifyOtp = async () => {
    setError("");
    if (otp.replace(/\s/g, "").length < 6) { setError("Enter the 6-digit code"); return; }
    try {
      const result = await verifyOtp({ email: email.trim(), code: otp.trim() });
      if (result.is_new_user) {
        setStep("set-password");
      } else {
        router.replace("/chat");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired code");
      setOtp("");
      setDevCode(null);
    }
  };

  // ── Password set (new users) ───────────────────────────────────────────────

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    try {
      await verifyOtp({ email: email.trim(), code: otp.trim(), password });
      router.replace("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080808] px-4">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-80 w-96 -translate-x-1/2 rounded-full bg-white/[0.02] blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/[0.08]">
            <svg className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-white">AI Research Copilot</h1>
          <p className="mt-1 text-[13px] text-zinc-500">Your intelligent research workspace</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/[0.07] bg-[#0f0f0f] p-6 shadow-2xl">

          {/* ── Landing ─────────────────────────────────────────────── */}
          {step === "landing" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-[15px] font-semibold text-white">Sign in</h2>
                <p className="mt-0.5 text-[12px] text-zinc-500">Continue with your preferred method</p>
              </div>

              {/* Social buttons */}
              <div className="space-y-2">
                {(["google", "apple", "facebook"] as const).map((provider) => {
                  const configured = oauthProviders[provider];
                  const icons = { google: <GoogleIcon />, apple: <AppleIcon />, facebook: <FacebookIcon /> };
                  const labels = { google: "Google", apple: "Apple", facebook: "Facebook" };
                  return (
                    <button
                      key={provider}
                      onClick={() => handleOAuthClick(provider)}
                      className={[
                        "flex w-full items-center gap-3 rounded-xl border px-4 py-2.5",
                        "text-[13px] font-medium transition",
                        configured
                          ? "border-white/[0.08] bg-white/[0.03] text-zinc-200 hover:border-white/[0.14] hover:bg-white/[0.06]"
                          : "border-white/[0.05] bg-transparent text-zinc-600 cursor-not-allowed",
                      ].join(" ")}
                    >
                      <span className={configured ? "" : "opacity-40"}>{icons[provider]}</span>
                      <span>Continue with {labels[provider]}</span>
                      {!configured && (
                        <span className="ml-auto rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-700">
                          not configured
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/[0.06]" />
                <span className="text-[11px] text-zinc-600">or continue with email</span>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>

              {/* Email form */}
              <form onSubmit={handleSendOtp} className="space-y-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">
                    <MailIcon />
                  </span>
                  <input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    autoComplete="email"
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 pl-10 pr-4 text-[13px] text-white placeholder-zinc-600 outline-none transition focus:border-white/20 focus:bg-white/[0.05]"
                  />
                </div>

                {error && <p className="text-[12px] text-red-400">{error}</p>}

                <button
                  type="submit"
                  disabled={isSendingOtp}
                  className="w-full rounded-xl bg-white py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-50"
                >
                  {isSendingOtp ? "Sending code…" : "Continue with Email"}
                </button>
              </form>

              <p className="text-center text-[11px] text-zinc-600">
                By continuing you agree to our{" "}
                <span className="cursor-pointer text-zinc-400 underline underline-offset-2">Terms</span>
                {" & "}
                <span className="cursor-pointer text-zinc-400 underline underline-offset-2">Privacy</span>
              </p>
            </div>
          )}

          {/* ── OTP step ────────────────────────────────────────────── */}
          {step === "otp" && (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => { setStep("landing"); setOtp(""); setError(""); setDevCode(null); }}
                  className="mt-0.5 rounded-lg p-1.5 text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300"
                >
                  <ArrowLeftIcon />
                </button>
                <div>
                  <h2 className="text-[15px] font-semibold text-white">Check your email</h2>
                  <p className="mt-0.5 text-[12px] text-zinc-500">
                    We sent a 6-digit code to{" "}
                    <span className="font-medium text-zinc-300">{email}</span>
                  </p>
                </div>
              </div>

              {/* Dev-mode banner — only shows when SMTP is not configured */}
              {devCode && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3.5 py-3">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-amber-400">Dev mode — no email sent</p>
                    <p className="mt-0.5 text-[11px] text-amber-400/70">
                      SMTP is not configured. Your code is{" "}
                      <span className="font-mono font-bold text-amber-300 tracking-widest">{devCode}</span>
                      {" "}(auto-filled below). Set{" "}
                      <code className="text-[10px] text-amber-400/80">SMTP_HOST</code> in{" "}
                      <code className="text-[10px] text-amber-400/80">backend/.env</code>{" "}to send real emails.
                    </p>
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
                onClick={handleVerifyOtp}
                disabled={isVerifyingOtp || otp.replace(/\s/g, "").length < 6}
                className="w-full rounded-xl bg-white py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-50"
              >
                {isVerifyingOtp ? "Verifying…" : "Verify Code"}
              </button>

              <div className="text-center text-[12px] text-zinc-600">
                {remaining > 0 ? (
                  <span>Resend code in {remaining}s</span>
                ) : (
                  <button
                    onClick={() => { setOtp(""); setError(""); setDevCode(null); handleSendOtp(); }}
                    disabled={isSendingOtp}
                    className="text-zinc-400 underline underline-offset-2 transition hover:text-zinc-200 disabled:opacity-50"
                  >
                    {isSendingOtp ? "Sending…" : "Resend code"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Set password (new users) ─────────────────────────────── */}
          {step === "set-password" && (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[12px] font-medium text-emerald-400">Email verified</span>
                </div>
                <h2 className="text-[15px] font-semibold text-white">Create a password</h2>
                <p className="mt-0.5 text-[12px] text-zinc-500">
                  Optional — lets you sign in without OTP next time
                </p>
              </div>

              <div className="space-y-3">
                <input
                  type="password"
                  placeholder="Password (min. 8 characters)"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[13px] text-white placeholder-zinc-600 outline-none transition focus:border-white/20 focus:bg-white/[0.05]"
                />
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[13px] text-white placeholder-zinc-600 outline-none transition focus:border-white/20 focus:bg-white/[0.05]"
                />
              </div>

              {error && <p className="text-[12px] text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={isVerifyingOtp}
                className="w-full rounded-xl bg-white py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-50"
              >
                {isVerifyingOtp ? "Setting up…" : "Create Password & Enter"}
              </button>

              <button
                type="button"
                onClick={() => router.replace("/chat")}
                className="w-full rounded-xl py-2 text-[12px] text-zinc-600 transition hover:text-zinc-400"
              >
                Skip — I'll use OTP each time
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
