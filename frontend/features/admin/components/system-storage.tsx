"use client";

import { useQuery } from "@tanstack/react-query";

import { adminApi, type StorageUsage } from "@/services/api/admin-api";
import { Badge, Button, HBar, SectionCard, formatBytes } from "@/features/admin/components/shared";
import { DynamicChart } from "@/features/admin/components/dynamic-chart";

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-[12.5px] border-b border-[var(--border-subtle)] last:border-b-0">
      <span className="font-medium text-zinc-400">{label}</span>
      <span className="text-right font-medium text-zinc-200">{value}</span>
    </div>
  );
}

export function OkBadge({ ok, unknownLabel = "not probed" }: { ok: boolean | null | undefined; unknownLabel?: string }) {
  if (ok === null || ok === undefined) {
    return <Badge tone="neutral">{unknownLabel}</Badge>;
  }
  return (
    <Badge tone={ok ? "good" : "bad"} dot>
      {ok ? "reachable" : "unreachable"}
    </Badge>
  );
}

export function ConfiguredBadge({
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

export function CountMeter({
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
      {neon.top_tables.length > 0 && (
        <DynamicChart
          id="neon-tables-donut"
          title="Table Storage Composition"
          subtitle="Relative byte weight by database table"
          data={neon.top_tables.map((t) => ({ label: t.name, value: t.bytes }))}
          valueFormat="bytes"
          height={140}
          isComposition={true}
        />
      )}
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
      {r2.by_prefix.length > 0 && (
        <DynamicChart
          id="r2-prefix-donut"
          title="Bucket Prefix Distribution"
          subtitle="Storage bytes by object namespace prefix"
          data={r2.by_prefix.map((p) => ({ label: p.prefix, value: p.bytes }))}
          valueFormat="bytes"
          height={140}
          isComposition={true}
        />
      )}
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

export function StorageUsageSection() {
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
