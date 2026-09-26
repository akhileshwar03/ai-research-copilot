"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminApi } from "@/services/api/admin-api";
import { setAdminStepUpToken } from "@/services/api/client";
import { Badge, Button, INPUT_CLASS, SectionCard } from "@/features/admin/components/shared";

/** Enrol or remove an authenticator app for the signed-in admin. */
export function TwoFactorCard() {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({ queryKey: ["admin-2fa-status"], queryFn: adminApi.twoFactorStatus });
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-2fa-status"] });
  const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : "Request failed");

  const start = useMutation({ mutationFn: adminApi.twoFactorSetup, onSuccess: setSetup, onError: fail });
  const enable = useMutation({
    mutationFn: () => adminApi.twoFactorEnable(code.trim()),
    onSuccess: ({ token }) => {
      setAdminStepUpToken(token);
      setSetup(null);
      setCode("");
      toast.success("Two-factor authentication enabled");
      refresh();
    },
    onError: fail,
  });
  const disable = useMutation({
    mutationFn: () => adminApi.twoFactorDisable(code.trim()),
    onSuccess: () => {
      setAdminStepUpToken(null);
      setCode("");
      toast.success("Two-factor authentication disabled");
      refresh();
    },
    onError: fail,
  });

  const enabled = status?.enabled ?? false;

  return (
    <SectionCard
      title="Two-factor authentication"
      description="Adds an authenticator-app code on top of the email sign-in code for the admin console."
      action={<Badge tone={enabled ? "good" : "neutral"}>{enabled ? "Enabled" : "Off"}</Badge>}
    >
      {!enabled && !setup && (
        <Button size="sm" onClick={() => start.mutate()} disabled={start.isPending}>
          Set up authenticator app
        </Button>
      )}

      {!enabled && setup && (
        <div className="space-y-3">
          <p className="text-[12.5px] text-zinc-500">
            In your authenticator app (Google Authenticator, 1Password, Authy…) add an account manually with this key,
            then enter the 6-digit code it shows.
          </p>
          <code className="block select-all break-all rounded-lg bg-[var(--surface-2)] px-3 py-2 font-data text-[13px] tracking-wider text-[var(--text-primary)]">
            {setup.secret}
          </code>
          <div className="flex flex-wrap items-center gap-2">
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              aria-label="Authenticator code"
              className={`${INPUT_CLASS} w-32 text-center font-data tracking-[0.3em]`}
            />
            <Button size="sm" onClick={() => enable.mutate()} disabled={enable.isPending || code.length !== 6}>
              Turn on
            </Button>
          </div>
        </div>
      )}

      {enabled && (
        <div className="space-y-3">
          <p className="text-[12.5px] text-zinc-500">
            Enter a current code to turn it off. If you lose your authenticator, an operator has to clear it in the
            database (users.totp_enabled).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              aria-label="Authenticator code"
              className={`${INPUT_CLASS} w-32 text-center font-data tracking-[0.3em]`}
            />
            <Button size="sm" variant="ghost" onClick={() => disable.mutate()} disabled={disable.isPending || code.length !== 6}>
              Turn off
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
