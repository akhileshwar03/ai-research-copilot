"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminApi, type ExternalApiInfo, type StorageUsage } from "@/services/api/admin-api";
import { Badge, Button, HBar, SectionCard, formatBytes, formatDate, formatUptime } from "@/features/admin/components/shared";

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

/** Green under 50%, amber 50-80%, red above -- so a glance at the bar's color
 *  alone says whether this needs attention, not just the exact percentage. */
function usageColor(pct: number): string {
  if (pct >= 80) return "#dc4c4c";
  if (pct >= 50) return "#c9a227";
  return "var(--marketing-accent)";
}

function StorageMeter({
  label, usedBytes, limitBytes, percent,
}: { label: string; usedBytes: number; limitBytes: number; percent: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[12.5px] font-medium text-zinc-300">{label}</p>
        <p className="text-[12.5px] text-zinc-500">
          <span className="font-semibold text-zinc-200">{formatBytes(usedBytes)}</span> / {formatBytes(limitBytes)}
          <span className="ml-1.5 text-zinc-600">({percent}%)</span>
        </p>
      </div>
      <div className="mt-1.5">
        <HBar value={usedBytes} max={limitBytes} color={usageColor(percent)} />
      </div>
    </div>
  );
}

function StorageUsageSection() {
  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["admin-storage-usage"],
    queryFn: () => adminApi.storageUsage(),
    staleTime: 30_000,
    // "Real time" here means auto-refreshing on a short interval while this tab
    // is open, not a websocket push -- a full bucket listing + DB size query
    // isn't cheap enough to poll every second, but 60s keeps it visibly live
    // without hammering either backend on every render.
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <SectionCard title="Storage usage">
        <p className="py-4 text-center text-[13px] text-zinc-500">Loading storage usage…</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Storage usage"
      action={
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-600">
            updated {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"}
          </span>
          <Button variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <NeonUsagePanel neon={data.neon} />
        <R2UsagePanel r2={data.r2} />
      </div>
    </SectionCard>
  );
}

function NeonUsagePanel({ neon }: { neon: StorageUsage["neon"] }) {
  if (!neon) {
    return (
      <div>
        <p className="text-[12.5px] font-medium text-zinc-300">Neon (Postgres)</p>
        <p className="mt-2 text-[12px] text-zinc-500">Not available — this server isn&apos;t connected to Postgres.</p>
      </div>
    );
  }
  return (
    <div>
      <StorageMeter label="Neon (Postgres) · free plan, 0.5 GB" usedBytes={neon.used_bytes} limitBytes={neon.limit_bytes} percent={neon.percent_used} />
      <div className="mt-3 space-y-1">
        {neon.top_tables.map((t) => (
          <div key={t.name} className="flex items-center justify-between gap-3 text-[11.5px]">
            <span className="truncate font-mono text-zinc-500" title={t.name}>{t.name}</span>
            <span className="shrink-0 text-zinc-400">{formatBytes(t.bytes)} <span className="text-zinc-600">· {t.row_count.toLocaleString()} rows</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function R2UsagePanel({ r2 }: { r2: StorageUsage["r2"] }) {
  if (!r2) {
    return (
      <div>
        <p className="text-[12.5px] font-medium text-zinc-300">Cloudflare R2</p>
        <p className="mt-2 text-[12px] text-zinc-500">Not configured — file uploads fall back to local disk.</p>
      </div>
    );
  }
  return (
    <div>
      <StorageMeter label="Cloudflare R2 · free tier, 10 GB" usedBytes={r2.used_bytes} limitBytes={r2.limit_bytes} percent={r2.percent_used} />
      <p className="mt-2 text-[11px] text-zinc-600">{r2.object_count.toLocaleString()} object{r2.object_count === 1 ? "" : "s"} total</p>
      <div className="mt-3 space-y-1">
        {r2.by_prefix.map((p) => (
          <div key={p.prefix} className="flex items-center justify-between gap-3 text-[11.5px]">
            <span className="truncate font-mono text-zinc-500" title={p.prefix}>{p.prefix}/</span>
            <span className="shrink-0 text-zinc-400">{formatBytes(p.bytes)} <span className="text-zinc-600">· {p.count.toLocaleString()} object{p.count === 1 ? "" : "s"}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Every real external service the project uses, one list -- Neon/R2 point
 *  back up at the Storage usage card above (real numbers, tracked directly);
 *  everything else links out to that provider's own usage/billing dashboard,
 *  since no self-serve usage API exists for most of these without a
 *  separate, higher-privilege credential this app doesn't hold. */
function ExternalApisSection({ apis }: { apis: ExternalApiInfo[] }) {
  return (
    <SectionCard title="External services & billing">
      <div className="divide-y divide-[var(--border-subtle)]">
        {apis.map((api) => (
          <div key={api.name} className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-zinc-200">{api.name}</p>
              <p className="truncate text-[11px] text-zinc-500">{api.category}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <ConfiguredBadge on={api.configured} />
              {api.tracked_here ? (
                <span className="text-[11.5px] text-zinc-600">Tracked above ↑</span>
              ) : (
                <a
                  href={api.dashboard_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11.5px] font-medium text-[var(--marketing-accent-text)] hover:underline"
                >
                  Track usage here →
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
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

      <StorageUsageSection />

      {isLoading || !info ? (
        <p className="py-6 text-center text-[13px] text-zinc-500">Loading system info…</p>
      ) : (
        <>
        <ExternalApisSection apis={info.external_apis} />
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
        </>
      )}
    </div>
  );
}
