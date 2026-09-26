"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { adminApi } from "@/services/api/admin-api";
import { setAdminStepUpToken } from "@/services/api/client";
import { Button, INPUT_CLASS } from "@/features/admin/components/shared";

/** Shown instead of the admin console when two-factor is enabled and this session has not entered a code. */
export function TwoFactorGate() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await adminApi.twoFactorVerify(code.trim());
      setAdminStepUpToken(token);
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-console relative flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="glass-card w-full max-w-sm space-y-4 rounded-2xl border border-[var(--border-subtle)] p-6 shadow-sm"
      >
        <div>
          <h1 className="font-headline text-lg font-bold text-[var(--text-primary)]">Two-factor verification</h1>
          <p className="mt-1 text-[12.5px] text-zinc-500">
            Enter the 6-digit code from your authenticator app to open the admin console.
          </p>
        </div>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          aria-label="Authenticator code"
          className={`${INPUT_CLASS} text-center font-data text-xl tracking-[0.4em]`}
        />
        {error && (
          <p role="alert" className="text-[12.5px] font-semibold text-rose-500">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || code.length !== 6}>
          {busy ? "Verifying…" : "Verify"}
        </Button>
      </form>
    </div>
  );
}
