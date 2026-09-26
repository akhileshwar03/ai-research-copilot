"use client";

import { useState } from "react";

import { type ExternalApiInfo, type SystemInfo } from "@/services/api/admin-api";
import { Badge, Button, HelpNote, HelpToggle, SectionCard, formatDate } from "@/features/admin/components/shared";
import { ConfiguredBadge, CountMeter } from "@/features/admin/components/system-storage";

export function ApiUsageSection({
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

export function ExternalApisSection({ apis }: { apis: ExternalApiInfo[] }) {
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

export function OperationalToolsSection() {
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
