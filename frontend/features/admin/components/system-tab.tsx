"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminApi, type ExternalApiInfo, type StorageUsage, type SystemInfo } from "@/services/api/admin-api";
import {
  Badge,
  Button,
  HBar,
  HelpNote,
  HelpToggle,
  SectionCard,
  formatBytes,
  formatDate,
  formatUptime,
} from "@/features/admin/components/shared";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-[12.5px] border-b border-[var(--border-subtle)] last:border-b-0">
      <span className="font-medium text-zinc-400">{label}</span>
      <span className="text-right font-medium text-zinc-200">{value}</span>
    </div>
  );
}

function OkBadge({ ok, unknownLabel = "not probed" }: { ok: boolean | null | undefined; unknownLabel?: string }) {
  if (ok === null || ok === undefined) {
    return <Badge tone="neutral">{unknownLabel}</Badge>;
  }
  return (
    <Badge tone={ok ? "good" : "bad"} dot>
      {ok ? "reachable" : "unreachable"}
    </Badge>
  );
}

function ConfiguredBadge({
  on,
  onLabel = "configured",
  offLabel = "not configured",
}: {
  on: boolean;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <Badge tone={on ? "good" : "warn"} dot>
      {on ? onLabel : offLabel}
    </Badge>
  );
}

function usageColor(pct: number): string {
  if (pct >= 80) return "#f87171";
  if (pct >= 50) return "#fbbf24";
  return "var(--marketing-accent)";
}

function StorageMeter({
  label,
  usedBytes,
  limitBytes,
  percent,
}: {
  label: string;
  usedBytes: number;
  limitBytes: number;
  percent: number;
}) {
  const isHigh = percent >= 80;
  return (
    <div
      className={`space-y-2 rounded-xl border p-3.5 transition-all ${
        isHigh
          ? "border-rose-500/40 bg-rose-500/5 ring-1 ring-rose-500/25"
          : "border-[var(--border-subtle)] bg-[var(--surface-1)]/50"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[12.5px] font-bold text-zinc-200">{label}</p>
          {isHigh && (
            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9.5px] font-bold text-rose-300">
              High usage
            </span>
          )}
        </div>
        <p className="font-data text-[12px] text-zinc-400">
          <span className="font-bold text-zinc-100">{formatBytes(usedBytes)}</span> / {formatBytes(limitBytes)}
          <span
            className={`ml-1.5 font-bold ${
              isHigh ? "text-rose-400" : "text-[var(--marketing-accent-text)]"
            }`}
          >
            ({percent}%)
          </span>
        </p>
      </div>
      <div>
        <HBar value={usedBytes} max={limitBytes} color={usageColor(percent)} />
      </div>
    </div>
  );
}

function CountMeter({
  label,
  used,
  limit,
  percent,
}: {
  label: string;
  used: number;
  limit: number;
  percent: number;
}) {
  const isHigh = percent >= 80;
  return (
    <div
      className={`space-y-2 rounded-xl border p-3.5 transition-all ${
        isHigh
          ? "border-rose-500/40 bg-rose-500/5 ring-1 ring-rose-500/25"
          : "border-[var(--border-subtle)] bg-[var(--surface-1)]/50"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[12.5px] font-bold text-zinc-200">{label}</p>
          {isHigh && (
            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9.5px] font-bold text-rose-300">
              Approaching limit
            </span>
          )}
        </div>
        <p className="font-data text-[12px] text-zinc-400">
          <span className="font-bold text-zinc-100">{used.toLocaleString()}</span> / {limit.toLocaleString()}
          <span
            className={`ml-1.5 font-bold ${
              isHigh ? "text-rose-400" : "text-[var(--marketing-accent-text)]"
            }`}
          >
            ({percent}%)
          </span>
        </p>
      </div>
      <div>
        <HBar value={used} max={limit} color={usageColor(percent)} />
      </div>
    </div>
  );
}

function NeonUsagePanel({ neon }: { neon: StorageUsage["neon"] }) {
  if (!neon) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-4">
        <p className="text-[13px] font-bold text-zinc-300">Neon (Postgres)</p>
        <p className="mt-2 text-[12px] text-zinc-500">Not connected to a Postgres instance.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <StorageMeter
        label="Neon (Postgres) · 0.5 GB Free Plan"
        usedBytes={neon.used_bytes}
        limitBytes={neon.limit_bytes}
        percent={neon.percent_used}
      />
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Top Database Tables</p>
        <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)]/60 px-3 py-1">
          {neon.top_tables.map((t) => (
            <div key={t.name} className="flex items-center justify-between gap-3 py-1.5 text-[11.5px]">
              <span className="truncate font-mono font-medium text-zinc-300" title={t.name}>
                {t.name}
              </span>
              <span className="shrink-0 font-data text-zinc-400">
                {formatBytes(t.bytes)}{" "}
                <span className="text-zinc-500">· {t.row_count.toLocaleString()} rows</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function R2UsagePanel({ r2 }: { r2: StorageUsage["r2"] }) {
  if (!r2) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-4">
        <p className="text-[13px] font-bold text-zinc-300">Cloudflare R2</p>
        <p className="mt-2 text-[12px] text-zinc-500">Not configured — file uploads fall back to local disk.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <StorageMeter
        label={`Cloudflare R2 · 10 GB Free Tier (${r2.object_count.toLocaleString()} objects)`}
        usedBytes={r2.used_bytes}
        limitBytes={r2.limit_bytes}
        percent={r2.percent_used}
      />
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Usage by Bucket Prefix</p>
        <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)]/60 px-3 py-1">
          {r2.by_prefix.map((p) => (
            <div key={p.prefix} className="flex items-center justify-between gap-3 py-1.5 text-[11.5px]">
              <span className="truncate font-mono font-medium text-zinc-300" title={p.prefix}>
                {p.prefix}/
              </span>
              <span className="shrink-0 font-data text-zinc-400">
                {formatBytes(p.bytes)}{" "}
                <span className="text-zinc-500">· {p.count.toLocaleString()} objects</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StorageUsageSection() {
  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["admin-storage-usage"],
    queryFn: () => adminApi.storageUsage(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <SectionCard title="Storage Usage">
        <div className="flex items-center justify-center p-6">
          <p className="text-[13px] text-zinc-500">Loading live storage metrics…</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Live Storage Infrastructure"
      description="Real-time storage consumption for Neon (Postgres — relational records and vector embeddings) and Cloudflare R2 (PDF documents object store). Numbers represent live filesystem/database queries."
      action={
        <div className="flex items-center gap-2">
          <span className="font-data text-[11px] text-zinc-500">
            Updated {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
          </span>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <NeonUsagePanel neon={data.neon} />
        <R2UsagePanel r2={data.r2} />
      </div>
    </SectionCard>
  );
}

function ApiUsageSection({
  info,
  onProbe,
  probing,
}: {
  info: SystemInfo;
  onProbe: () => void;
  probing: boolean;
}) {
  const tavily = info.web_search.usage;
  const resend = info.email.recent;
  const uptimerobot = info.uptimerobot?.monitors;
  const anyConfigured =
    info.web_search.configured || info.email.provider === "resend" || Boolean(info.uptimerobot?.configured);
  const haveAnyData =
    (info.web_search.configured && tavily) ||
    (info.email.provider === "resend" && resend) ||
    (info.uptimerobot?.configured && uptimerobot);

  if (!anyConfigured) {
    return null;
  }

  return (
    <SectionCard
      title="External API Usage &amp; Quotas"
      description="Real quotas and recent delivery events queried directly from Tavily, Resend, and UptimeRobot via configured API keys."
      action={
        !haveAnyData && (
          <Button size="sm" onClick={onProbe} disabled={probing}>
            {probing ? "Probing APIs…" : "Probe integrations"}
          </Button>
        )
      }
    >
      {!haveAnyData ? (
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <p className="text-[13px] text-zinc-400">
            Live quota data not yet probed for Tavily, Resend, and UptimeRobot.
          </p>
          <div className="mt-3">
            <Button size="sm" onClick={onProbe} disabled={probing}>
              {probing ? "Probing APIs…" : "Probe integrations now"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          {/* Tavily */}
          <div>
            {info.web_search.configured ? (
              tavily?.ok ? (
                <CountMeter
                  label={`Tavily (${tavily.plan ?? "Standard"} Plan)`}
                  used={tavily.plan_usage ?? 0}
                  limit={tavily.plan_limit ?? 1}
                  percent={
                    tavily.plan_limit
                      ? Math.round(((tavily.plan_usage ?? 0) / tavily.plan_limit) * 100)
                      : 0
                  }
                />
              ) : (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-3.5">
                  <p className="text-[12.5px] font-bold text-zinc-300">Tavily Search</p>
                  <p className="mt-1 text-[12px] text-zinc-500">
                    {tavily ? "Usage check failed — see logs." : "Click Probe integrations to check."}
                  </p>
                </div>
              )
            ) : (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-3.5">
                <p className="text-[12.5px] font-bold text-zinc-300">Tavily</p>
                <p className="mt-1 text-[12px] text-zinc-500">Not configured.</p>
              </div>
            )}
          </div>

          {/* Resend */}
          <div>
            {info.email.provider === "resend" ? (
              resend?.ok ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/50 p-3.5">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[12.5px] font-bold text-zinc-200">
                      Resend (Last {resend.sample_size} emails{resend.has_more ? "+" : ""})
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Most recent: {resend.most_recent_at ? formatDate(resend.most_recent_at) : "—"}
                  </p>
                  <div className="mt-2.5 divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] px-2.5 py-0.5">
                    {Object.entries(resend.by_status ?? {}).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between py-1 text-[11.5px]">
                        <span className="font-mono text-zinc-300">{status}</span>
                        <span className="font-data font-semibold text-zinc-200">{count.toLocaleString()}</span>
                      </div>
                    ))}
                    {Object.keys(resend.by_status ?? {}).length === 0 && (
                      <p className="py-1 text-[11.5px] text-zinc-500">No emails sent yet.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-3.5">
                  <p className="text-[12.5px] font-bold text-zinc-300">Resend Email</p>
                  <p className="mt-1 text-[12px] text-zinc-500">
                    {resend
                      ? resend.restricted
                        ? "Key is sending-only by design."
                        : "Activity probe failed."
                      : "Click Probe integrations to check."}
                  </p>
                </div>
              )
            ) : (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-3.5">
                <p className="text-[12.5px] font-bold text-zinc-300">Resend</p>
                <p className="mt-1 text-[12px] text-zinc-500">Provider: {info.email.provider}</p>
              </div>
            )}
          </div>

          {/* UptimeRobot */}
          <div>
            {info.uptimerobot?.configured ? (
              uptimerobot?.ok ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/50 p-3.5">
                  <p className="text-[12.5px] font-bold text-zinc-200">UptimeRobot Monitors</p>
                  <div className="mt-2 space-y-1.5">
                    {(uptimerobot.monitors ?? []).map((m, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[11.5px]"
                      >
                        <span className="truncate font-semibold text-zinc-300" title={m.name}>
                          {m.name}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge tone={m.status === "up" ? "good" : m.status === "paused" ? "neutral" : "bad"} dot>
                            {m.status}
                          </Badge>
                          {m.uptime_30d != null && (
                            <span className="font-data font-semibold text-zinc-400">
                              {m.uptime_30d}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {(uptimerobot.monitors ?? []).length === 0 && (
                      <p className="text-[11.5px] text-zinc-500">No active monitors found.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-3.5">
                  <p className="text-[12.5px] font-bold text-zinc-300">UptimeRobot</p>
                  <p className="mt-1 text-[12px] text-zinc-500">
                    {uptimerobot ? "Status check failed." : "Click Probe integrations to check."}
                  </p>
                </div>
              )
            ) : (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-3.5">
                <p className="text-[12.5px] font-bold text-zinc-300">UptimeRobot</p>
                <p className="mt-1 text-[12px] text-zinc-500">Not configured.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

const SERVICE_DESCRIPTIONS: Record<string, string> = {
  OpenAI:
    "The core LLM provider for the live app. Powers: Research Copilot's document chat (OPENAI_CHAT_MODEL), AI Checker + Writing Feedback, and Humanizer's standard 'Basic' mode. If this key is missing or invalid, those three tools fail outright.",
  "Modal (Ultra Human GPU hosting)":
    "GPU hosting for Humanizer's 'Ultra Human' mode (the fine-tuned LoRA model) when humanizer_ultra_backend is set to 'modal'. Scale-up path when Ultra Human serves multiple concurrent users.",
  Tavily:
    "Web search grounding for the Real-time AI tool. Without this key the tool cannot ground its answers in live web results.",
  Resend:
    "Sends one-time sign-in codes (OTP) to users. Without this configured in production, email delivery will not work.",
  Sentry:
    "Error monitoring and performance tracing for both FastAPI backend and Next.js frontend. Safe to leave unconfigured in local dev.",
  UptimeRobot:
    "Health and uptime monitoring for querex.app. Purely observational status monitor.",
  "Neon (Postgres)":
    "Primary relational and vector database: users, documents, chunks, chats, settings, and audit trail.",
  "Cloudflare R2":
    "Object storage for uploaded PDF files. Production must have this configured since Render server disks wipe on deploy.",
  "Google AI (Gemini)":
    "Used by offline fine-tuning scripts (backend/scripts/finetune/) — not called by live production app.",
  Groq:
    "Used for finetune tooling only, not part of live production request path.",
  Anthropic:
    "Used for finetune tooling only, not part of live production request path.",
};

function ExternalApisSection({ apis }: { apis: ExternalApiInfo[] }) {
  const [openRow, setOpenRow] = useState<string | null>(null);

  return (
    <SectionCard
      title="Third-Party Integrations &amp; Billing"
      description="Every external API service configured in the backend environment. Neon and R2 live usage is displayed above; other services provide direct links to their vendor billing consoles."
    >
      <div className="divide-y divide-[var(--border-subtle)]">
        {apis.map((api) => {
          const description = SERVICE_DESCRIPTIONS[api.name];
          const isOpen = openRow === api.name;
          return (
            <div key={api.name} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-bold text-zinc-200">{api.name}</p>
                    {description && (
                      <HelpToggle
                        label={api.name}
                        open={isOpen}
                        onToggle={() => setOpenRow(isOpen ? null : api.name)}
                      />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11.5px] text-zinc-500">{api.category}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <ConfiguredBadge on={api.configured} />
                  {api.tracked_here ? (
                    <span className="font-data text-[11.5px] font-semibold text-zinc-500">
                      Tracked in Storage ↑
                    </span>
                  ) : (
                    <a
                      href={api.dashboard_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--marketing-accent-text)] hover:underline"
                    >
                      <span>Vendor Dashboard</span>
                      <span>→</span>
                    </a>
                  )}
                </div>
              </div>
              {description && isOpen && <HelpNote>{description}</HelpNote>}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

const OPERATIONAL_TOOLS: {
  name: string;
  category: string;
  description: string;
  dashboard_url: string;
}[] = [
  {
    name: "Render",
    category: "Backend hosting",
    description:
      "Runs the live FastAPI backend (ai-research-copilot-xtmd.onrender.com) and holds every backend env var. Auto-deploys from main branch.",
    dashboard_url: "https://dashboard.render.com",
  },
  {
    name: "cron-job.org",
    category: "Keep-alive & retention trigger",
    description:
      "Pings the backend / endpoint every few minutes to keep the Render free-tier instance active and execute scheduled data retention cleanup.",
    dashboard_url: "https://console.cron-job.org",
  },
  {
    name: "Vercel",
    category: "Frontend hosting",
    description:
      "Builds and hosts the Next.js frontend at querex.app with edge CDN and frontend environment variables.",
    dashboard_url: "https://vercel.com/dashboard",
  },
  {
    name: "Google Cloud Console",
    category: "Google OAuth client",
    description:
      "Manages Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) and authorized redirect callbacks.",
    dashboard_url: "https://console.cloud.google.com",
  },
  {
    name: "GitHub OAuth App",
    category: "GitHub OAuth client",
    description:
      "Manages GitHub OAuth application settings, Client ID, Client Secret, and authorized redirect callback URLs.",
    dashboard_url: "https://github.com/settings/developers",
  },
  {
    name: "Google Search Console",
    category: "SEO & indexing",
    description:
      "Monitors Google search presence, sitemaps, and indexing health for querex.app.",
    dashboard_url: "https://search.google.com/search-console",
  },
  {
    name: "Cloudflare (Domain & DNS)",
    category: "Domain registrar & DNS",
    description:
      "Manages querex.app DNS records (A/CNAME records to Vercel and MX/TXT records for email delivery).",
    dashboard_url: "https://dash.cloudflare.com",
  },
];

function OperationalToolsSection() {
  const [openRow, setOpenRow] = useState<string | null>(null);

  return (
    <SectionCard
      title="Hosting &amp; Domain Infrastructure"
      description="Operational accounts and services supporting the deployment, keep-alive routines, OAuth providers, and DNS routing."
    >
      <div className="divide-y divide-[var(--border-subtle)]">
        {OPERATIONAL_TOOLS.map((tool) => {
          const isOpen = openRow === tool.name;
          return (
            <div key={tool.name} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-bold text-zinc-200">{tool.name}</p>
                    <HelpToggle
                      label={tool.name}
                      open={isOpen}
                      onToggle={() => setOpenRow(isOpen ? null : tool.name)}
                    />
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-zinc-500">{tool.category}</p>
                </div>
                <a
                  href={tool.dashboard_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[11.5px] font-semibold text-[var(--marketing-accent-text)] hover:underline"
                >
                  Open Console →
                </a>
              </div>
              {isOpen && <HelpNote>{tool.description}</HelpNote>}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

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
            <p className="text-[13px] font-medium text-zinc-400">Loading system telemetry…</p>
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
