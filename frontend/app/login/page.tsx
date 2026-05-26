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
import { authApi } from "@/services/api/auth-api";

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

function AppleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="#1877F2" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ) : (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
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

// ─── Field ─────────────────────────────────────────────────────────────────────

function Field({
  type = "text", placeholder, value, onChange, autoComplete, right,
}: {
  type?: string; placeholder: string; value: string;
  onChange: (v: string) => void; autoComplete?: string; right?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-[var(--border-medium)] bg-white/[0.03] px-4 py-2.5 text-[13px] text-[var(--text-primary)] placeholder-zinc-600 outline-none transition focus:border-[var(--border-strong)] focus:bg-white/[0.05]"
      />
      {right && <div className="absolute right-3 top-1/2 -translate-y-1/2">{right}</div>}
    </div>
  );
}

// ─── Social buttons ────────────────────────────────────────────────────────────

function SocialButtons({
  oauthProviders,
  onClick,
}: {
  oauthProviders: Record<string, boolean>;
  onClick: (p: "google" | "apple" | "facebook") => void;
}) {
  const providers = [
    { key: "google" as const, label: "Google", icon: <GoogleIcon /> },
    { key: "apple" as const, label: "Apple", icon: <AppleIcon /> },
    { key: "facebook" as const, label: "Facebook", icon: <FacebookIcon /> },
  ];
  return (
    <div className="space-y-2">
      {providers.map(({ key, label, icon }) => {
        const configured = oauthProviders[key];
        return (
          <button
            key={key}
            onClick={() => onClick(key)}
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
  );
}

// ─── Password strength ─────────────────────────────────────────────────────────

function passwordScore(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];
const STRENGTH_COLORS = ["", "bg-red-500", "bg-amber-500", "bg-yellow-400", "bg-emerald-500", "bg-emerald-400"];
const STRENGTH_TEXT =   ["", "text-red-400", "text-amber-400", "text-yellow-300", "text-emerald-400", "text-emerald-300"];

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordScore(password);
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={[
              "h-1 flex-1 rounded-full transition-all duration-300",
              i <= score ? STRENGTH_COLORS[score] : "bg-white/[0.06]",
            ].join(" ")}
          />
        ))}
      </div>
      <p className={`text-[11px] ${STRENGTH_TEXT[score]}`}>{STRENGTH_LABELS[score]}</p>
    </div>
  );
}

// ─── Forgot password modal ─────────────────────────────────────────────────────

type ForgotStep = "email" | "otp" | "reset" | "done";

function ForgotPasswordFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<ForgotStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const { remaining, start: startCountdown } = useCountdown(60);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.includes("@")) { setError("Enter a valid email address"); return; }
    setLoading(true);
    try {
      const res = await authApi.sendOtp({ email: email.trim() });
      setDevCode((res as { _dev_code?: string })._dev_code ?? null);
      if ((res as { _dev_code?: string })._dev_code) setCode((res as { _dev_code?: string })._dev_code!);
      setStep("otp");
      startCountdown();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = (completedValue?: string) => {
    const c = completedValue ?? code;
    if (c.replace(/\s/g, "").length < 6) return;
    setStep("reset");
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPw.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (newPw !== confirmPw) { setError("Passwords don't match"); return; }
    setLoading(true);
    try {
      await authApi.resetPassword(email.trim(), code, newPw);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Back button — except on done */}
      {step !== "done" && (
        <button
          onClick={() => {
            if (step === "email") { onClose(); return; }
            if (step === "otp") setStep("email");
            if (step === "reset") setStep("otp");
          }}
          className="flex items-center gap-1.5 text-[12px] text-zinc-600 transition hover:text-zinc-300"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      )}

      {/* ── Step 1: enter email ── */}
      {step === "email" && (
        <>
          <div>
            <p className="text-[15px] font-semibold text-white">Reset your password</p>
            <p className="mt-1 text-[12px] text-zinc-500">Enter your account email and we'll send a verification code.</p>
          </div>
          <form onSubmit={handleSendCode} className="space-y-3">
            <Field type="email" placeholder="Email address" value={email} onChange={(v) => { setEmail(v); setError(""); }} autoComplete="email" />
            {error && <p className="text-[12px] text-red-400">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-white py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-50">
              {loading ? "Sending…" : "Send Reset Code"}
            </button>
          </form>
        </>
      )}

      {/* ── Step 2: enter OTP ── */}
      {step === "otp" && (
        <>
          <div>
            <p className="text-[15px] font-semibold text-white">Check your email</p>
            <p className="mt-1 text-[12px] text-zinc-500">
              Enter the 6-digit code sent to <span className="text-zinc-300">{email}</span>
            </p>
          </div>
          {devCode && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
              <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-[11px] font-medium text-amber-400">Dev mode — code auto-filled</p>
                <p className="text-[11px] text-amber-600">Code: <span className="font-mono font-bold text-amber-400">{devCode}</span></p>
              </div>
            </div>
          )}
          <OtpInput length={6} value={code} onChange={(v) => { setCode(v); setError(""); }} onComplete={handleVerifyCode} />
          {error && <p className="text-center text-[12px] text-red-400">{error}</p>}
          <button
            onClick={() => handleVerifyCode()}
            disabled={code.replace(/\s/g, "").length < 6}
            className="w-full rounded-xl bg-white py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-50"
          >
            Continue
          </button>
          <div className="text-center text-[12px] text-zinc-600">
            {remaining > 0 ? (
              <span>Resend in {remaining}s</span>
            ) : (
              <button onClick={() => { setCode(""); setDevCode(null); handleSendCode(new Event("click") as unknown as React.FormEvent); }} disabled={loading} className="text-zinc-400 underline underline-offset-2 hover:text-zinc-200">
                {loading ? "Sending…" : "Resend code"}
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Step 3: enter new password ── */}
      {step === "reset" && (
        <>
          <div>
            <p className="text-[15px] font-semibold text-white">Set a new password</p>
            <p className="mt-1 text-[12px] text-zinc-500">Choose a strong password for your account.</p>
          </div>
          <form onSubmit={handleReset} className="space-y-3">
            <div>
              <Field
                type={showPw ? "text" : "password"}
                placeholder="New password (min. 8 characters)"
                value={newPw}
                onChange={(v) => { setNewPw(v); setError(""); }}
                autoComplete="new-password"
                right={
                  <button type="button" onClick={() => setShowPw((s) => !s)} className="text-zinc-600 hover:text-zinc-400">
                    <EyeIcon open={showPw} />
                  </button>
                }
              />
              <PasswordStrength password={newPw} />
            </div>
            <Field
              type={showPw ? "text" : "password"}
              placeholder="Confirm new password"
              value={confirmPw}
              onChange={(v) => { setConfirmPw(v); setError(""); }}
              autoComplete="new-password"
            />
            {error && <p className="text-[12px] text-red-400">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-white py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-50">
              {loading ? "Resetting…" : "Reset Password"}
            </button>
          </form>
        </>
      )}

      {/* ── Step 4: success ── */}
      {step === "done" && (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-white">Password reset!</p>
            <p className="mt-1 text-[12px] text-zinc-500">Sign in with your new password.</p>
          </div>
          <button onClick={onClose} className="w-full rounded-xl bg-white py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100">
            Back to Sign In
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

type Mode = "signin" | "signup";
type Step = "form" | "otp" | "done";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isReady, login, sendOtp, verifyOtp, signup,
    isLoggingIn, isSendingOtp, isVerifyingOtp, isSigningUp, oauthProviders } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState<Step>("form");
  const [showForgot, setShowForgot] = useState(false);

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { remaining, start: startCountdown } = useCountdown(60);

  useEffect(() => {
    if (isReady && isAuthenticated) router.replace("/chat");
  }, [isReady, isAuthenticated, router]);

  // Show OAuth error toasts from redirect params (e.g. /login?error=google_auth_failed)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      toast.error(OAUTH_ERROR_MESSAGES[err] ?? "Sign-in failed. Please try again.", {
        duration: 5000,
      });
      // Clean the URL without causing a navigation
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  // Reset when switching tabs
  const switchMode = (m: Mode) => {
    setMode(m); setStep("form");
    setEmail(""); setPassword(""); setConfirmPassword("");
    setOtp(""); setError(""); setDevCode(null);
  };

  // ── OAuth ────────────────────────────────────────────────────────────────────
  const handleOAuth = (provider: "google" | "apple" | "facebook") => {
    if (!oauthProviders[provider]) {
      toast.info(`${provider.charAt(0).toUpperCase() + provider.slice(1)} sign-in is not configured yet. Use email below.`, { duration: 4000 });
      return;
    }
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    window.location.href = `${base}/auth/oauth/${provider}`;
  };

  // ── Sign In ──────────────────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) { setError("Enter your email and password"); return; }
    try {
      await login({ email: email.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
    }
  };

  // ── Sign Up step 1: validate + send OTP ─────────────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    try {
      // Validate uniqueness first
      await signup({ email: email.trim(), password });
      // Then send OTP for email verification
      const result = await sendOtp({ email: email.trim() });
      setDevCode(result._dev_code ?? null);
      if (result._dev_code) setOtp(result._dev_code);
      setStep("otp");
      startCountdown();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    }
  };

  // ── Sign Up step 2: verify OTP ───────────────────────────────────────────────
  const handleVerifyOtp = async (completedValue?: string) => {
    setError("");
    const code = completedValue ?? otp;
    if (code.replace(/\s/g, "").length < 6) return;
    try {
      await verifyOtp({ email: email.trim(), code, password });
      router.replace("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired code");
      setOtp(""); setDevCode(null);
    }
  };

  // ── OTP sign-in ──────────────────────────────────────────────────────────────
  const handleSendSignInOtp = async () => {
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

  const handleVerifySignInOtp = async (completedValue?: string) => {
    setError("");
    const code = completedValue ?? otp;
    if (code.replace(/\s/g, "").length < 6) return;
    try {
      await verifyOtp({ email: email.trim(), code });
      router.replace("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired code");
      setOtp(""); setDevCode(null);
    }
  };

  const isLoading = isLoggingIn || isSendingOtp || isVerifyingOtp || isSigningUp;

  // ── Render ───────────────────────────────────────────────────────────────────
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

          {/* ── Tab bar ───────────────────────────────────────────────────── */}
          {step === "form" && (
            <div className="flex border-b border-[var(--border-subtle)]">
              {(["signin", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={[
                    "flex-1 py-3.5 text-[13px] font-medium transition",
                    mode === m
                      ? "border-b-2 border-white text-white"
                      : "text-zinc-600 hover:text-zinc-400",
                  ].join(" ")}
                  style={mode === m ? { marginBottom: "-1px" } : {}}
                >
                  {m === "signin" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>
          )}

          <div className="p-6">

            {/* ── FORGOT PASSWORD flow ─────────────────────────────────────── */}
            {showForgot && (
              <ForgotPasswordFlow onClose={() => setShowForgot(false)} />
            )}

            {/* ── SIGN IN: form ────────────────────────────────────────────── */}
            {!showForgot && mode === "signin" && step === "form" && (
              <div className="space-y-4">
                <SocialButtons oauthProviders={oauthProviders} onClick={handleOAuth} />

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="text-[11px] text-zinc-600">or</span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>

                <form onSubmit={handleSignIn} className="space-y-3">
                  <Field type="email" placeholder="Email address" value={email} onChange={(v) => { setEmail(v); setError(""); }} autoComplete="email" />
                  <Field
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(v) => { setPassword(v); setError(""); }}
                    autoComplete="current-password"
                    right={
                      <button type="button" onClick={() => setShowPassword((s) => !s)} className="text-zinc-600 hover:text-zinc-400">
                        <EyeIcon open={showPassword} />
                      </button>
                    }
                  />
                  {error && <p className="text-[12px] text-red-400">{error}</p>}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full rounded-xl bg-white py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-50"
                  >
                    {isLoggingIn ? "Signing in…" : "Sign In"}
                  </button>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setShowForgot(true)}
                      className="text-[12px] text-zinc-600 transition hover:text-zinc-300 underline underline-offset-2"
                    >
                      Forgot password?
                    </button>
                  </div>
                </form>

                {/* Email code sign-in */}
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="text-[11px] text-zinc-600">or</span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>
                <button
                  onClick={handleSendSignInOtp}
                  disabled={isLoading}
                  className="w-full rounded-xl border border-white/[0.08] py-2.5 text-[13px] font-medium text-zinc-300 transition hover:border-white/[0.15] hover:bg-white/[0.03] disabled:opacity-50"
                >
                  {isSendingOtp ? "Sending code…" : "Sign in with email code"}
                </button>
              </div>
            )}

            {/* ── SIGN UP: form ────────────────────────────────────────────── */}
            {!showForgot && mode === "signup" && step === "form" && (
              <div className="space-y-4">
                <SocialButtons oauthProviders={oauthProviders} onClick={handleOAuth} />

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="text-[11px] text-zinc-600">or create an account</span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>

                <form onSubmit={handleSignUp} className="space-y-3">
                  <Field type="email" placeholder="Email address" value={email} onChange={(v) => { setEmail(v); setError(""); }} autoComplete="email" />
                  <div>
                    <Field
                      type={showPassword ? "text" : "password"}
                      placeholder="Password (min. 8 characters)"
                      value={password}
                      onChange={(v) => { setPassword(v); setError(""); }}
                      autoComplete="new-password"
                      right={
                        <button type="button" onClick={() => setShowPassword((s) => !s)} className="text-zinc-600 hover:text-zinc-400">
                          <EyeIcon open={showPassword} />
                        </button>
                      }
                    />
                    <PasswordStrength password={password} />
                  </div>
                  <Field
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(v) => { setConfirmPassword(v); setError(""); }}
                    autoComplete="new-password"
                  />
                  {error && <p className="text-[12px] text-red-400">{error}</p>}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full rounded-xl bg-white py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-50"
                  >
                    {isLoading ? "Sending verification…" : "Create Account"}
                  </button>
                </form>

                <p className="text-center text-[11px] text-zinc-600">
                  We'll send a code to verify your email address.
                </p>
              </div>
            )}

            {/* ── OTP step (both sign in and sign up) ──────────────────────── */}
            {!showForgot && step === "otp" && (
              <div className="space-y-5">
                <div>
                  <button
                    onClick={() => { setStep("form"); setOtp(""); setError(""); setDevCode(null); }}
                    className="mb-4 flex items-center gap-1.5 text-[12px] text-zinc-600 transition hover:text-zinc-300"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>
                  <p className="text-[15px] font-semibold text-white">Check your email</p>
                  <p className="mt-1 text-[12px] text-zinc-500">
                    We sent a 6-digit code to <span className="text-zinc-300">{email}</span>
                  </p>
                </div>

                {/* Dev mode banner */}
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
                  onComplete={mode === "signup" ? handleVerifyOtp : handleVerifySignInOtp}
                />

                {error && <p className="text-center text-[12px] text-red-400">{error}</p>}

                <button
                  onClick={() => mode === "signup" ? handleVerifyOtp() : handleVerifySignInOtp()}
                  disabled={isVerifyingOtp || otp.replace(/\s/g, "").length < 6}
                  className="w-full rounded-xl bg-white py-2.5 text-[13px] font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-50"
                >
                  {isVerifyingOtp ? "Verifying…" : mode === "signup" ? "Verify & Create Account" : "Sign In"}
                </button>

                <div className="text-center text-[12px] text-zinc-600">
                  {remaining > 0 ? (
                    <span>Resend in {remaining}s</span>
                  ) : (
                    <button
                      onClick={() => { setOtp(""); setError(""); setDevCode(null); handleSendSignInOtp(); }}
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
