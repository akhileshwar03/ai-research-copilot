"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminApi } from "@/services/api/admin-api";
import { Badge, Button, SectionCard, formatDate, formatUptime } from "@/features/admin/components/shared";

import { Row, OkBadge, ConfiguredBadge, StorageUsageSection } from "@/features/admin/components/system-storage";
import { ApiUsageSection, ExternalApisSection, OperationalToolsSection } from "@/features/admin/components/system-integrations";

export function SystemTab() {
  const queryClient = useQueryClient();
  const [probe, setProbe] = useState(false);
  const [showConsoles, setShowConsoles] = useState(false);
  const { data: info, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-system", probe],
    queryFn: () => adminApi.system(probe),
    staleTime: 30_000,
  });

  const retention = useMutation({
    mutationFn: () => adminApi.runRetention(),
    onSuccess: (res) => {
      const s = res.summary;
      toast.success(
        `${res.message}: ${s.documents} docs, ${s.sessions} chats, ${s.realtime_sessions} realtime purged`,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-system"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Cleanup failed"),
  });

  // Calculate high-level health
  const isHealthy = Boolean(
    info?.database.ok &&
    info?.vector_store.ok &&
    (!probe || (info?.openai.ok !== false && info?.humanizer.ultra_ok !== false))
  );

  return (
    <div className="space-y-5">
      {/* Top Header & Probe Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-headline text-[15px] font-bold text-[var(--text-primary)]">
            System Architecture &amp; Health
          </h2>
          <p className="mt-0.5 text-[12px] text-zinc-400">
            Real-time environment configuration, database state, and provider connectivity
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* External Consoles Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowConsoles((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[12px] font-semibold text-zinc-300 hover:bg-[var(--surface-2)]"
              title="Open external cloud service consoles"
            >
              <span>Consoles</span>
              <span className="text-[10px]">▾</span>
            </button>
            {showConsoles && (
              <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-1)] p-2 shadow-xl">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Cloud Consoles
                </p>
                <div className="space-y-0.5 text-xs">
                  <a
                    href="https://console.neon.tech"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-zinc-300 hover:bg-[var(--surface-2)] hover:text-white"
                  >
                    <span>Neon Postgres</span>
                    <span className="text-zinc-500">↗</span>
                  </a>
                  <a
                    href="https://dash.cloudflare.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-zinc-300 hover:bg-[var(--surface-2)] hover:text-white"
                  >
                    <span>Cloudflare R2</span>
                    <span className="text-zinc-500">↗</span>
                  </a>
                  <a
                    href="https://resend.com/emails"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-zinc-300 hover:bg-[var(--surface-2)] hover:text-white"
                  >
                    <span>Resend Mail</span>
                    <span className="text-zinc-500">↗</span>
                  </a>
                  <a
                    href="https://uptimerobot.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-zinc-300 hover:bg-[var(--surface-2)] hover:text-white"
                  >
                    <span>UptimeRobot</span>
                    <span className="text-zinc-500">↗</span>
                  </a>
                </div>
              </div>
            )}
          </div>

          <Button
            size="sm"
            onClick={() => {
              setProbe(true);
              refetch();
            }}
            disabled={isFetching}
            title="Perform live network ping to OpenAI and Ollama (takes a few seconds)"
          >
            <svg
              className={`h-3.5 w-3.5 ${isFetching && probe ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12z" />
            </svg>
            <span>{isFetching && probe ? "Probing APIs…" : "Probe Integrations"}</span>
          </Button>
          <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Summary Banner */}
      {info && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 shadow-xs backdrop-blur-md ${
            isHealthy
              ? "border-emerald-500/25 bg-emerald-500/10"
              : "border-rose-500/25 bg-rose-500/10"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`flex h-3 w-3 rounded-full ${
                isHealthy ? "bg-emerald-400 animate-pulse" : "bg-rose-400 animate-ping"
              }`}
            />
            <div>
              <p className="text-[13.5px] font-bold text-[var(--text-primary)]">
                {isHealthy ? "All core services operational" : "One or more probed services reporting issues"}
              </p>
              <p className="text-[11.5px] text-zinc-400">
                Uptime: {formatUptime(info.uptime_seconds)} · Environment: {info.environment} · Platform: {info.platform}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={info.environment === "production" ? "info" : "warn"} dot>
              {info.environment}
            </Badge>
            <Badge tone={info.database.ok ? "good" : "bad"} dot>
              DB: {info.database.dialect}
            </Badge>
          </div>
        </div>
      )}

      {/* Storage Usage Section */}
      <StorageUsageSection />

      {isLoading || !info ? (
        <div className="glass-card flex items-center justify-center rounded-xl p-12 text-center">
          <div className="flex flex-col items-center gap-2">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2"
              style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--marketing-accent)" }}
            />
            <p className="text-[13px] font-medium text-zinc-400">Loading system status…</p>
          </div>
        </div>
      ) : (
        <>
          <ApiUsageSection
            info={info}
            onProbe={() => {
              setProbe(true);
              refetch();
            }}
            probing={isFetching && probe}
          />

          <ExternalApisSection apis={info.external_apis} />

          <OperationalToolsSection />

          {/* Grid of Core Technical Subsystems */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Runtime Card */}
            <SectionCard
              title="Runtime &amp; Execution Environment"
              description="FastAPI process details, platform architecture, uptime, rate limiting enforcement, and auto-bootstrapped admin emails."
            >
              <Row
                label="Environment Mode"
                value={
                  <Badge tone={info.environment === "production" ? "info" : "warn"} dot>
                    {info.environment}
                  </Badge>
                }
              />
              <Row label="Server Instance Uptime" value={formatUptime(info.uptime_seconds)} />
              <Row label="Python Runtime" value={<span className="font-mono">{info.python_version}</span>} />
              <Row
                label="Host Platform"
                value={
                  <span className="font-mono text-[11.5px]" title={info.platform}>
                    {info.platform}
                  </span>
                }
              />
              <Row
                label="Per-IP Rate Limiting"
                value={<ConfiguredBadge on={info.rate_limit_enabled} onLabel="enforced" offLabel="disabled" />}
              />
              <Row
                label="Debug Mode"
                value={<Badge tone={info.debug ? "warn" : "good"} dot>{info.debug ? "enabled" : "disabled"}</Badge>}
              />
              <Row label="Bootstrap Admin Emails" value={<span className="font-data font-semibold">{info.admin_bootstrap_emails}</span>} />
            </SectionCard>

            {/* Data Stores Card */}
            <SectionCard
              title="Databases &amp; Document Retention"
              description="Postgres connection state, pgvector search status, file storage targets, and scheduled document lifecycle cleanup."
            >
              <Row
                label="Database Connection"
                value={
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[12px]">{info.database.dialect}</span>
                    <OkBadge ok={info.database.ok} />
                  </span>
                }
              />
              <Row
                label="Alembic Schema Version"
                value={<span className="font-mono text-[11.5px]">{info.database.alembic_version ?? "unknown"}</span>}
              />
              <Row label="pgvector Embeddings Extension" value={<OkBadge ok={info.vector_store.ok} />} />
              <Row
                label="Uploaded Document Storage"
                value={
                  <Badge tone={info.storage.backend === "r2" ? "good" : "warn"} dot>
                    {info.storage.backend === "r2"
                      ? "Cloudflare R2"
                      : `local disk (${info.storage.uploads_dir})`}
                  </Badge>
                }
              />
              <Row
                label="Retention Window"
                value={info.retention.days === 0 ? "Retain forever" : `${info.retention.days} days`}
              />
              <Row
                label="Last Retention Cleanup"
                value={info.retention.last_run_at ? formatDate(info.retention.last_run_at) : "never"}
              />
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Run the retention cleanup now? Documents and chats older than the retention window are permanently deleted.",
                      )
                    ) {
                      retention.mutate();
                    }
                  }}
                  disabled={retention.isPending}
                >
                  {retention.isPending ? "Purging…" : "Run cleanup now"}
                </Button>
              </div>
            </SectionCard>

            {/* AI Providers Card */}
            <SectionCard
              title="AI Models &amp; Inference Engines"
              description="Live LLM backends: OpenAI model configurations, self-hosted Ultra Human fine-tune, and Tavily grounding search."
            >
              <Row
                label="OpenAI API"
                value={
                  <span className="flex items-center gap-2">
                    <ConfiguredBadge on={info.openai.configured} />
                    <OkBadge ok={info.openai.ok} />
                  </span>
                }
              />
              <Row
                label="Chat &amp; Checker Model"
                value={<span className="font-mono text-[11.5px] text-zinc-300">{info.openai.chat_model}</span>}
              />
              <Row
                label="Humanizer Rewrite Model"
                value={
                  <span className="font-mono text-[11.5px] text-zinc-300">
                    {info.humanizer.rewrite_model} (k={info.humanizer.candidates})
                  </span>
                }
              />
              <Row
                label="Humanizer Classify Model"
                value={<span className="font-mono text-[11.5px] text-zinc-300">{info.humanizer.classify_model}</span>}
              />
              <Row
                label="Ultra Human (LoRA via Ollama)"
                value={
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[11.5px] text-zinc-300">{info.humanizer.ultra_model}</span>
                    <OkBadge ok={info.humanizer.ultra_ok} />
                  </span>
                }
              />
              <Row
                label="Tavily Web Search"
                value={<ConfiguredBadge on={info.web_search.configured} />}
              />
            </SectionCard>

            {/* Auth & Email Card */}
            <SectionCard
              title="Authentication &amp; Mail Delivery"
              description="OAuth login providers, active email delivery gateway, and sender addresses for one-time access codes."
            >
              <Row
                label="Email Delivery Gateway"
                value={
                  <Badge tone={info.email.provider === "dev-echo" ? "warn" : "good"} dot>
                    {info.email.provider === "dev-echo" ? "dev echo (codes in API response)" : info.email.provider}
                  </Badge>
                }
              />
              <Row label="Outbound From Address" value={<span className="font-mono text-[11.5px]">{info.email.from}</span>} />
              <Row label="Google OAuth Sign-in" value={<ConfiguredBadge on={info.oauth.google} />} />
              <Row label="GitHub OAuth Sign-in" value={<ConfiguredBadge on={info.oauth.github} />} />
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
