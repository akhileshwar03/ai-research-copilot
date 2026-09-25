"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminApi, type ExternalApiInfo, type StorageUsage } from "@/services/api/admin-api";
import { Badge, Button, HBar, HelpNote, HelpToggle, SectionCard, formatBytes, formatDate, formatUptime } from "@/features/admin/components/shared";

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
      description="Real, live usage against the two storage services this app actually pays/could pay for: Neon (Postgres — all your app data: users, documents' text chunks, chat sessions, settings, audit log) and Cloudflare R2 (the raw uploaded PDF files themselves). Numbers come from a direct query each refresh, not an estimate."
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

/** Same visual language as StorageMeter (Storage usage above) but for a
 *  plain count (credits/emails) instead of bytes — Tavily's usage/limit
 *  aren't byte quantities, so formatBytes doesn't apply here. */
function CountMeter({ label, used, limit, percent }: { label: string; used: number; limit: number; percent: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[12.5px] font-medium text-zinc-300">{label}</p>
        <p className="text-[12.5px] text-zinc-500">
          <span className="font-semibold text-zinc-200">{used.toLocaleString()}</span> / {limit.toLocaleString()}
          <span className="ml-1.5 text-zinc-600">({percent}%)</span>
        </p>
      </div>
      <div className="mt-1.5">
        <HBar value={used} max={limit} color={usageColor(percent)} />
      </div>
    </div>
  );
}

/** Real, live usage for the three services (besides Neon/R2 above) whose own
 *  API can be read with the exact credential already configured — same
 *  visual treatment as the Storage usage card, not buried as a text row.
 *  Only Tavily, Resend, and UptimeRobot qualify (see SERVICE_DESCRIPTIONS
 *  below for why OpenAI/Sentry can't: they need a separate, higher-
 *  privilege credential this app doesn't hold). Needs probe=true to have
 *  real numbers — before that, these fields are all null. */
function ApiUsageSection({
  info,
  onProbe,
  probing,
}: {
  info: import("@/services/api/admin-api").SystemInfo;
  onProbe: () => void;
  probing: boolean;
}) {
  const tavily = info.web_search.usage;
  const resend = info.email.recent;
  // Optional chaining throughout this component is deliberate, not
  // defensive-programming filler: info.uptimerobot only exists once the
  // running backend has been redeployed with this field -- during a
  // rolling deploy (or a stale local dev process) an older backend can
  // still answer this exact request shape without it, and this card must
  // degrade instead of crashing the whole System tab.
  const uptimerobot = info.uptimerobot?.monitors;
  const anyConfigured = info.web_search.configured || info.email.provider === "resend" || Boolean(info.uptimerobot?.configured);
  const haveAnyData =
    (info.web_search.configured && tavily) ||
    (info.email.provider === "resend" && resend) ||
    (info.uptimerobot?.configured && uptimerobot);

  if (!anyConfigured) {
    return null; // none of the three are even configured — nothing to show
  }

  return (
    <SectionCard
      title="API usage"
      description="Real, live usage pulled directly from each provider's own API, using the exact same key already configured for real requests — not an estimate. Only Tavily, Resend, and UptimeRobot expose this without a separate, higher-privilege credential (see External services & billing below for why OpenAI and Sentry can't show real numbers here the same way)."
      action={
        !haveAnyData && (
          <Button onClick={onProbe} disabled={probing}>
            {probing ? "Probing…" : "Probe integrations"}
          </Button>
        )
      }
    >
      {!haveAnyData ? (
        <p className="py-4 text-center text-[13px] text-zinc-500">Click &quot;Probe integrations&quot; to pull live usage from Tavily, Resend, and UptimeRobot.</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          <div>
            {info.web_search.configured ? (
              tavily?.ok ? (
                <CountMeter
                  label={`Tavily${tavily.plan ? ` · ${tavily.plan} plan` : ""}`}
                  used={tavily.plan_usage ?? 0}
                  limit={tavily.plan_limit ?? 1}
                  percent={tavily.plan_limit ? Math.round(((tavily.plan_usage ?? 0) / tavily.plan_limit) * 100) : 0}
                />
              ) : (
                <div>
                  <p className="text-[12.5px] font-medium text-zinc-300">Tavily</p>
                  <p className="mt-2 text-[12px] text-zinc-500">{tavily ? "Usage check failed — see backend logs." : "Click Probe integrations to check."}</p>
                </div>
              )
            ) : (
              <div>
                <p className="text-[12.5px] font-medium text-zinc-300">Tavily</p>
                <p className="mt-2 text-[12px] text-zinc-500">Not configured.</p>
              </div>
            )}
          </div>
          <div>
            {info.email.provider === "resend" ? (
              resend?.ok ? (
                <div>
                  <p className="text-[12.5px] font-medium text-zinc-300">Resend · last {resend.sample_size} sent{resend.has_more ? "+" : ""}</p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    most recent {resend.most_recent_at ? formatDate(resend.most_recent_at) : "—"}
                  </p>
                  <div className="mt-3 space-y-1">
                    {Object.entries(resend.by_status ?? {}).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between gap-3 text-[11.5px]">
                        <span className="truncate font-mono text-zinc-500">{status}</span>
                        <span className="shrink-0 text-zinc-400">{count.toLocaleString()}</span>
                      </div>
                    ))}
                    {Object.keys(resend.by_status ?? {}).length === 0 && (
                      <p className="text-[11.5px] text-zinc-600">No emails sent yet.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-[12.5px] font-medium text-zinc-300">Resend</p>
                  <p className="mt-2 text-[12px] text-zinc-500">
                    {resend
                      ? resend.restricted
                        ? "Key is scoped to sending-only — activity view unavailable by design."
                        : "Activity check failed — see backend logs."
                      : "Click Probe integrations to check."}
                  </p>
                </div>
              )
            ) : (
              <div>
                <p className="text-[12.5px] font-medium text-zinc-300">Resend</p>
                <p className="mt-2 text-[12px] text-zinc-500">Not the active email provider ({info.email.provider}).</p>
              </div>
            )}
          </div>
          <div>
            {info.uptimerobot?.configured ? (
              uptimerobot?.ok ? (
                <div>
                  <p className="text-[12.5px] font-medium text-zinc-300">UptimeRobot</p>
                  <div className="mt-2 space-y-1.5">
                    {(uptimerobot.monitors ?? []).map((m, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-[11.5px]">
                        <span className="truncate text-zinc-400" title={m.name}>{m.name}</span>
                        <span className="shrink-0 flex items-center gap-1.5">
                          <Badge tone={m.status === "up" ? "good" : m.status === "paused" ? "neutral" : "bad"}>{m.status}</Badge>
                          {m.uptime_30d != null && <span className="text-zinc-600">{m.uptime_30d}% · 30d</span>}
                        </span>
                      </div>
                    ))}
                    {(uptimerobot.monitors ?? []).length === 0 && (
                      <p className="text-[11.5px] text-zinc-600">No monitors on this account.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-[12.5px] font-medium text-zinc-300">UptimeRobot</p>
                  <p className="mt-2 text-[12px] text-zinc-500">{uptimerobot ? "Status check failed — see backend logs." : "Click Probe integrations to check."}</p>
                </div>
              )
            ) : (
              <div>
                <p className="text-[12.5px] font-medium text-zinc-300">UptimeRobot</p>
                <p className="mt-2 text-[12px] text-zinc-500">Not configured.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// Keyed by ExternalApiInfo.name (backend admin.py's external_apis list) —
// "what is it, where in the app is it actually used, and for what" per
// service, so a new admin can click into any one of them without asking.
const SERVICE_DESCRIPTIONS: Record<string, string> = {
  "OpenAI": "The core LLM provider for the live app. Powers: Research Copilot's document chat (OPENAI_CHAT_MODEL), AI Checker + Writing Feedback, and Humanizer's standard 'Basic' mode (separate rewrite/classify models so Humanizer never silently falls back to the chat model). If this key is missing or invalid, those three tools fail outright — there's no fallback provider.",
  "Modal (Ultra Human GPU hosting)": "GPU hosting for Humanizer's 'Ultra Human' mode (the fine-tuned LoRA model) when the humanizer_ultra_backend runtime setting is set to 'modal' — built for multiple concurrent users, unlike the 'local' option below. Not the current default: today Ultra Human runs on 'local' (a single Ollama instance on this machine), so this key can be unconfigured without breaking anything live yet — it's the scale-up path once Ultra Human needs to serve more than one user at a time.",
  "Tavily": "Web search grounding for the Real-time AI tool — when a user asks something needing current information, this is what actually searches the live web before the model answers. Real-time AI has no other source of live data; without this key the tool can't ground its answers in anything beyond the model's training data. Real plan-usage numbers (not an estimate) show in the API usage card above after you click Probe integrations.",
  "Resend": "Sends the actual emails: one-time sign-in codes (OTP) to users with no Google/GitHub account. Without this configured, the backend falls back to 'dev echo' — returning the code directly in the API response instead of emailing it, which is fine for local testing but must never happen in production. Recent real send activity (last 100, by delivery status) shows in the API usage card above after you click Probe integrations.",
  "Sentry": "Error monitoring for both halves of the app — the FastAPI backend and the Next.js frontend each report unhandled exceptions and a 10% sample of performance traces here. Fully inert until this DSN is set (no calls made at all), so it's safe to leave blank in any environment you don't want reporting.",
  "UptimeRobot": "A monitor watching whether querex.app is up — not called by the app itself, it calls the app. Keeping the Render free-tier instance awake and triggering daily retention (which piggybacks on any hit to /) is actually done by a separate cron-job.org ping, not this — UptimeRobot here is purely a status/uptime dashboard. Real live monitor status/uptime shows in the API usage card above (using a read-only UptimeRobot API key, separate from anything the live app needs), once configured.",
  "Neon (Postgres)": "The single source of truth for almost everything: user accounts, uploaded documents' metadata and text chunks (for retrieval), chat sessions and messages, humanizer/checker run history, every runtime setting you change from this admin panel, and the admin audit log itself. If this is down, the app is down.",
  "Cloudflare R2": "Object storage for the raw bytes of every uploaded PDF (separate from Neon, which only holds the extracted text/chunks). If R2 isn't configured, uploads fall back to local disk on the backend server — fine for local dev, but Render wipes local disk on every deploy, so production must always have this configured.",
  "Google AI (Gemini)": "Used only by the offline fine-tuning scripts under backend/scripts/finetune/ (building/evaluating the Ultra Human LoRA model) — not called anywhere in the live production app. Safe to leave unconfigured on Render/Vercel.",
  "Groq": "Same as Google AI above — finetune tooling only (backend/scripts/finetune/), not part of the request path for any live tool. Safe to leave unconfigured in production.",
  "Anthropic": "Same as Google AI/Groq above — finetune tooling only, not called by the live app. Safe to leave unconfigured in production.",
};

/** Every real external service the project uses, one list -- Neon/R2 point
 *  back up at the Storage usage card above (real numbers, tracked directly);
 *  everything else links out to that provider's own usage/billing dashboard,
 *  since no self-serve usage API exists for most of these without a
 *  separate, higher-privilege credential this app doesn't hold. */
function ExternalApisSection({ apis }: { apis: ExternalApiInfo[] }) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  return (
    <SectionCard
      title="External services & billing"
      description="Every third-party API/service the codebase can call, one list, so a new admin knows what exists and where its usage/billing actually lives. 'configured' means the credential is present in this environment's env vars — it doesn't mean the service is reachable right now (that's the AI providers card's 'reachable'/'unreachable' badge, only checked when you click Probe integrations). Neon and R2 are tracked directly above since this app can query their real usage; everything else links out to that provider's own dashboard because this app doesn't hold a credential with permission to read usage/billing from them. Click any service's '?' for exactly where and how it's used in the app."
    >
      <div className="divide-y divide-[var(--border-subtle)]">
        {apis.map((api) => {
          const description = SERVICE_DESCRIPTIONS[api.name];
          const isOpen = openRow === api.name;
          return (
            <div key={api.name} className="py-2.5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12.5px] font-medium text-zinc-200">{api.name}</p>
                    {description && (
                      <HelpToggle label={api.name} open={isOpen} onToggle={() => setOpenRow(isOpen ? null : api.name)} />
                    )}
                  </div>
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
              {description && isOpen && <HelpNote>{description}</HelpNote>}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// 2026-09-22: the section above only covers services *this app's backend code
// calls with a credential* -- it can't say anything about the rest of the
// operational stack (where it's hosted, who's watching it stay up, where the
// domain/OAuth apps are managed) because there's no env var here to check.
// Those are still real accounts a newly-appointed admin needs to know exist,
// so this is a second, static reference list -- no "configured" badge (this
// app has no way to verify any of these from the backend), just what each
// one is, why it matters, and where to manage it.
const OPERATIONAL_TOOLS: { name: string; category: string; description: string; dashboard_url: string }[] = [
  {
    name: "Render",
    category: "Backend hosting",
    description: "Runs the live FastAPI backend (ai-research-copilot-xtmd.onrender.com) and holds every backend env var — all API keys, DATABASE_URL, SENTRY_DSN, everything in backend/.env.example. Deploys automatically on every push to main; env var changes need a manual 'Deploy latest commit' to take effect. Free tier spins the instance down after inactivity, which is exactly what the cron-job.org ping below exists to prevent.",
    dashboard_url: "https://dashboard.render.com",
  },
  {
    name: "cron-job.org",
    category: "Keep-alive + retention trigger",
    description: "Pings the backend's / endpoint every few minutes. This is what actually keeps the Render free-tier instance from spinning down between real visitors, and — since retention cleanup piggybacks on any hit to / (see Data stores card above) — is what makes daily document/chat retention run on schedule rather than only when a real user happens to visit. UptimeRobot below is a separate, purely observational status monitor; this is the one doing the keep-alive work.",
    dashboard_url: "https://console.cron-job.org",
  },
  {
    name: "Vercel",
    category: "Frontend hosting",
    description: "Builds and serves the Next.js frontend at querex.app, and holds every frontend env var (NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SENTRY_DSN, etc.). Auto-deploys on every push to main; a changed env var needs a manual redeploy from here to actually apply — the running deployment doesn't pick it up on its own.",
    dashboard_url: "https://vercel.com/dashboard",
  },
  {
    name: "Google Cloud Console",
    category: "Google OAuth client",
    description: "Where the Google OAuth client behind the 'Continue with Google' login button lives — GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET on Render come from here, and this is also where the authorized redirect URI (pointing at the Render backend, not querex.app) is set. Needed if that redirect URI, the client secret, or the app's OAuth consent screen ever need changing.",
    dashboard_url: "https://console.cloud.google.com",
  },
  {
    name: "GitHub OAuth App",
    category: "GitHub OAuth client",
    description: "Same role as Google Cloud Console above, for the 'Continue with GitHub' button — GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET on Render come from an OAuth App registered here, with its own authorized callback URL pointing at the Render backend.",
    dashboard_url: "https://github.com/settings/developers",
  },
  {
    name: "Google Search Console",
    category: "SEO / search indexing",
    description: "Tracks whether Google has indexed querex.app and how it appears in search results, and holds the domain-ownership verification for that. Purely informational for SEO — nothing in the app's own code calls this or depends on it at runtime.",
    dashboard_url: "https://search.google.com/search-console",
  },
  {
    name: "Cloudflare (domain & DNS)",
    category: "Domain registrar & DNS",
    description: "querex.app is registered here and its DNS records (the A/CNAME records pointing the domain at Vercel, plus anything for email sending via Resend) are managed here — the same Cloudflare account as the R2 object storage above, but this is the domain/DNS side of it, unrelated to R2's file storage.",
    dashboard_url: "https://dash.cloudflare.com",
  },
];

function OperationalToolsSection() {
  const [openRow, setOpenRow] = useState<string | null>(null);
  return (
    <SectionCard
      title="Hosting, monitoring & domain tools"
      description="Everything that keeps Querex online and discoverable but isn't an API the backend code calls, so it can't be checked as 'configured' the way the list above can. These are separate accounts/dashboards a newly-appointed admin needs to know exist and have access to — this app has no way to verify any of them itself. Click any tool's '?' for exactly what it's for."
    >
      <div className="divide-y divide-[var(--border-subtle)]">
        {OPERATIONAL_TOOLS.map((tool) => {
          const isOpen = openRow === tool.name;
          return (
            <div key={tool.name} className="py-2.5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12.5px] font-medium text-zinc-200">{tool.name}</p>
                    <HelpToggle label={tool.name} open={isOpen} onToggle={() => setOpenRow(isOpen ? null : tool.name)} />
                  </div>
                  <p className="text-[11px] text-zinc-500">{tool.category}</p>
                </div>
                <a
                  href={tool.dashboard_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[11.5px] font-medium text-[var(--marketing-accent-text)] hover:underline"
                >
                  Open dashboard →
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
        <ApiUsageSection info={info} onProbe={() => { setProbe(true); refetch(); }} probing={isFetching && probe} />
        <ExternalApisSection apis={info.external_apis} />
        <OperationalToolsSection />
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            title="Runtime"
            description="What process is actually running right now: dev vs. production mode, how long this specific server instance has been up (resets on every deploy/restart), the Python version, per-IP rate limiting on/off, and how many emails are auto-promoted to admin via the ADMIN_EMAILS env var (survives database resets — a safety net if every admin account is ever locked out)."
          >
            <Row label="Environment" value={<Badge tone={info.environment === "production" ? "info" : "warn"}>{info.environment}</Badge>} />
            <Row label="Uptime (this instance)" value={formatUptime(info.uptime_seconds)} />
            <Row label="Python" value={info.python_version} />
            <Row label="Platform" value={<span className="max-w-[260px] truncate text-[11.5px]" title={info.platform}>{info.platform}</span>} />
            <Row label="Rate limiting" value={<ConfiguredBadge on={info.rate_limit_enabled} onLabel="enabled" offLabel="disabled" />} />
            <Row label="Debug" value={<Badge tone={info.debug ? "warn" : "good"}>{info.debug ? "on" : "off"}</Badge>} />
            <Row label="Admin bootstrap emails" value={info.admin_bootstrap_emails} />
          </SectionCard>

          <SectionCard
            title="Data stores"
            description="Where the app's data actually lives, and the automatic cleanup policy for it: the Postgres connection and its current migration version, whether the pgvector extension (powers Research Copilot's document search) is working, whether uploaded files go to Cloudflare R2 or local disk (local disk is wiped on every Render deploy — never rely on it in production), and the retention window that auto-deletes documents/chats after N days. 'Run cleanup now' triggers that deletion immediately instead of waiting for the next scheduled pass."
          >
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

          <SectionCard
            title="AI providers"
            description="Every model backend the live app talks to. OpenAI powers chat, AI Checker, and the standard Humanizer 'Basic' mode. Ultra Human is a separate, self-hosted fine-tuned model (not OpenAI) served by a local Ollama instance — 'reachable' only shows green when that Ollama server is actually running and reachable from this backend. Tavily is the web-search provider behind Real-time AI — its real live usage numbers are in the API usage card above, not repeated here. Click 'Probe integrations' above to actually ping OpenAI/Ollama live (a few seconds) — otherwise this only shows whether each is configured, not whether it currently works."
          >
            <Row label="OpenAI" value={<span className="flex items-center gap-2"><ConfiguredBadge on={info.openai.configured} /><OkBadge ok={info.openai.ok} /></span>} />
            <Row label="Chat / checker model" value={<span className="font-mono text-[11.5px]">{info.openai.chat_model}</span>} />
            <Row label="Humanizer rewrite model" value={<span className="font-mono text-[11.5px]">{info.humanizer.rewrite_model} · best of {info.humanizer.candidates}</span>} />
            <Row label="Humanizer classify model" value={<span className="font-mono text-[11.5px]">{info.humanizer.classify_model}</span>} />
            <Row label="Ultra Human (Ollama)" value={<span className="flex items-center gap-2"><span className="font-mono text-[11.5px]">{info.humanizer.ultra_model}</span><OkBadge ok={info.humanizer.ultra_ok} /></span>} />
            <Row label="Web search (Tavily)" value={<ConfiguredBadge on={info.web_search.configured} />} />
          </SectionCard>

          <SectionCard
            title="Auth & email"
            description="How users actually sign in and how one-time codes get delivered. Querex has no passwords — only Google/GitHub OAuth and email one-time codes (OTP). 'Email delivery' shows the real sender: Resend in production, or 'dev echo' in local/dev when no email provider is configured, meaning OTP codes are returned directly in the API response instead of emailed (dev-only, never in production). Real recent send activity is in the API usage card above, not repeated here. Google/GitHub sign-in badges show whether that provider's client ID/secret are set — if either is off, that button is hidden from the login page rather than shown broken."
          >
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
