"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminApi } from "@/services/api/admin-api";
import { Badge, Button, SectionCard, formatDate, formatUptime } from "@/features/admin/components/shared";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-[12.5px]">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right text-zinc-200">{value}</span>
    </div>
  );
}

function OkBadge({ ok, unknownLabel = "not probed" }: { ok: boolean | null | undefined; unknownLabel?: string }) {
  if (ok === null || ok === undefined) return <Badge>{unknownLabel}</Badge>;
  return <Badge tone={ok ? "good" : "bad"}>{ok ? "reachable" : "unreachable"}</Badge>;
}

function ConfiguredBadge({ on, onLabel = "configured", offLabel = "not configured" }: { on: boolean; onLabel?: string; offLabel?: string }) {
  return <Badge tone={on ? "good" : "warn"}>{on ? onLabel : offLabel}</Badge>;
}

export function SystemTab() {
  const queryClient = useQueryClient();
  const [probe, setProbe] = useState(false);
  const { data: info, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-system", probe],
    queryFn: () => adminApi.system(probe),
    staleTime: 30_000,
  });

  const retention = useMutation({
    mutationFn: () => adminApi.runRetention(),
    onSuccess: (res) => {
      const s = res.summary;
      toast.success(`${res.message}: ${s.documents} documents, ${s.sessions} chats, ${s.realtime_sessions} real-time chats purged`);
      queryClient.invalidateQueries({ queryKey: ["admin-system"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Cleanup failed"),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-headline text-[15px] font-bold text-zinc-200">System</h2>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setProbe(true);
              refetch();
            }}
            disabled={isFetching}
            title="Also ping OpenAI and the local Ollama server (a few seconds)"
          >
            {isFetching && probe ? "Probing…" : "Probe integrations"}
          </Button>
          <Button onClick={() => refetch()} disabled={isFetching}>Refresh</Button>
        </div>
      </div>

      {isLoading || !info ? (
        <p className="py-6 text-center text-[13px] text-zinc-500">Loading system info…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Runtime">
            <Row label="Environment" value={<Badge tone={info.environment === "production" ? "info" : "warn"}>{info.environment}</Badge>} />
            <Row label="Uptime (this instance)" value={formatUptime(info.uptime_seconds)} />
            <Row label="Python" value={info.python_version} />
            <Row label="Platform" value={<span className="max-w-[260px] truncate text-[11.5px]" title={info.platform}>{info.platform}</span>} />
            <Row label="Rate limiting" value={<ConfiguredBadge on={info.rate_limit_enabled} onLabel="enabled" offLabel="disabled" />} />
            <Row label="Debug" value={<Badge tone={info.debug ? "warn" : "good"}>{info.debug ? "on" : "off"}</Badge>} />
            <Row label="Admin bootstrap emails" value={info.admin_bootstrap_emails} />
          </SectionCard>

          <SectionCard title="Data stores">
            <Row label="Database" value={<span className="flex items-center gap-2">{info.database.dialect} <OkBadge ok={info.database.ok} /></span>} />
            <Row label="Schema version" value={<span className="font-mono text-[11.5px]">{info.database.alembic_version ?? "unknown"}</span>} />
            <Row label="Vector store (pgvector)" value={<OkBadge ok={info.vector_store.ok} />} />
            <Row label="File storage" value={<Badge tone={info.storage.backend === "r2" ? "good" : "warn"}>{info.storage.backend === "r2" ? "Cloudflare R2" : `local disk (${info.storage.uploads_dir})`}</Badge>} />
            <Row label="Retention window" value={`${info.retention.days === 0 ? "keep forever" : `${info.retention.days} days`}`} />
            <Row label="Last cleanup run" value={info.retention.last_run_at ? formatDate(info.retention.last_run_at) : "never"} />
            <div className="mt-3 flex justify-end">
              <Button onClick={() => { if (window.confirm("Run the retention cleanup now? Documents and chats older than the retention window are permanently deleted.")) retention.mutate(); }} disabled={retention.isPending}>
                {retention.isPending ? "Running…" : "Run cleanup now"}
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="AI providers">
            <Row label="OpenAI" value={<span className="flex items-center gap-2"><ConfiguredBadge on={info.openai.configured} /><OkBadge ok={info.openai.ok} /></span>} />
            <Row label="Chat / checker model" value={<span className="font-mono text-[11.5px]">{info.openai.chat_model}</span>} />
            <Row label="Humanizer rewrite model" value={<span className="font-mono text-[11.5px]">{info.humanizer.rewrite_model} · best of {info.humanizer.candidates}</span>} />
            <Row label="Humanizer classify model" value={<span className="font-mono text-[11.5px]">{info.humanizer.classify_model}</span>} />
            <Row label="Ultra Human (Ollama)" value={<span className="flex items-center gap-2"><span className="font-mono text-[11.5px]">{info.humanizer.ultra_model}</span><OkBadge ok={info.humanizer.ultra_ok} /></span>} />
            <Row label="Web search (Tavily)" value={<ConfiguredBadge on={info.web_search.configured} />} />
          </SectionCard>

          <SectionCard title="Auth & email">
            <Row label="Email delivery" value={<Badge tone={info.email.provider === "dev-echo" ? "warn" : "good"}>{info.email.provider === "dev-echo" ? "dev echo (codes shown in response)" : info.email.provider}</Badge>} />
            <Row label="Sender" value={<span className="text-[11.5px]">{info.email.from}</span>} />
            <Row label="Google sign-in" value={<ConfiguredBadge on={info.oauth.google} />} />
            <Row label="GitHub sign-in" value={<ConfiguredBadge on={info.oauth.github} />} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
