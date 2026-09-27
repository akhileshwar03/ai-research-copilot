"use client";

import { useQuery } from "@tanstack/react-query";

import { adminApi, type AiCostBucket } from "@/services/api/admin-api";
import { HBar, SectionCard } from "@/features/admin/components/shared";

/** Dollar amounts here are tiny, so show enough decimals to be meaningful. */
export function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  if (value >= 0.1) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${value.toFixed(4)}`;
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/60 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 font-data text-xl font-bold text-[var(--text-primary)]">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p>}
    </div>
  );
}

function Rows({
  rows,
  maxCost,
}: {
  rows: { key: string; label: string; sub?: string; searchOnly?: boolean; bucket: AiCostBucket }[];
  maxCost: number;
}) {
  if (rows.length === 0) return <p className="py-4 text-center text-xs text-zinc-500">No AI calls logged in this range.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="min-w-0 truncate font-semibold text-[var(--text-primary)]" title={r.label}>
              {r.label}
            </span>
            <span className="shrink-0 font-data font-bold text-[var(--text-primary)]">{r.bucket.unpriced_calls === r.bucket.calls ? "unpriced" : formatUsd(r.bucket.cost_usd)}</span>
          </div>
          <div className="mt-1">
            <HBar value={r.bucket.cost_usd} max={maxCost} />
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500 font-data">
            {r.searchOnly
              ? `${r.bucket.calls.toLocaleString()} searches · ${r.bucket.search_credits.toLocaleString()} credits`
              : `${r.bucket.calls.toLocaleString()} calls · ${tokens(r.bucket.input_tokens)} in · ${tokens(r.bucket.output_tokens)} out`}
            {!r.searchOnly && r.bucket.search_credits > 0 && ` · ${r.bucket.search_credits.toLocaleString()} search credits`}
            {r.bucket.unpriced_calls > 0 && ` · ${r.bucket.unpriced_calls} unpriced`}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Estimated AI spend for the selected range and user scope, from logged token counts and list prices. */
export function AiCostSection({ start, end, userId }: { start: string; end: string; userId?: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-ai-cost", { start, end, userId }],
    queryFn: () => adminApi.aiUsage({ start, end, user_id: userId }),
    retry: false,
    staleTime: 60_000,
  });

  return (
    <SectionCard
      title="AI spend (estimated)"
      description="Token usage reported by OpenAI for each call, priced at OpenAI's list prices. OpenAI's invoice is the authority; this is for comparing tools and users."
    >
      {isLoading && <p className="py-6 text-center text-xs text-zinc-500">Loading AI usage…</p>}
      {isError && <p className="py-6 text-center text-xs text-rose-500">Could not load AI usage.</p>}
      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Estimated cost" value={formatUsd(data.total.cost_usd)} sub={`${data.start} → ${data.end}`} />
            <Stat label="AI calls" value={data.total.calls.toLocaleString()} />
            <Stat label="Input tokens" value={tokens(data.total.input_tokens)} sub={`${tokens(data.total.cached_input_tokens)} cached`} />
            <Stat label="Output tokens" value={tokens(data.total.output_tokens)} />
          </div>

          {data.total.search_credits > 0 && (
            <p className="text-[12px] text-zinc-500">
              Includes {data.total.search_credits.toLocaleString()} web-search credit(s) at{" "}
              {formatUsd(data.search_pricing.usd_per_credit)} each. Tavily&apos;s free plan covers the first{" "}
              {data.search_pricing.free_credits_per_month.toLocaleString()} credits a month, so real spend on searches may be lower
              (see{" "}
              <a href={data.search_pricing.source} target="_blank" rel="noreferrer" className="underline">
                Tavily pricing
              </a>
              ).
            </p>
          )}

          {data.unpriced_models.length > 0 && (
            <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-[var(--text-primary)]">
              {data.total.unpriced_calls} call(s) used a model with no verified price ({data.unpriced_models.join(", ")}) and are
              not included in the cost. Add the model to the price list to include them.
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-3">
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-zinc-500">By tool</h4>
              <Rows
                maxCost={Math.max(0.000001, ...data.by_tool.map((t) => t.cost_usd))}
                rows={data.by_tool.map((t) => ({ key: t.tool ?? "none", label: t.label, bucket: t }))}
              />
            </div>
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-zinc-500">By model</h4>
              <Rows
                maxCost={Math.max(0.000001, ...data.by_model.map((m) => m.cost_usd))}
                rows={data.by_model.map((m) => ({
                  key: `${m.model}/${m.kind}`,
                  label: `${m.model} (${m.kind})`,
                  searchOnly: m.kind === "search",
                  bucket: m,
                }))}
              />
            </div>
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-zinc-500">Top users by cost</h4>
              <Rows
                maxCost={Math.max(0.000001, ...data.top_users.map((u) => u.cost_usd))}
                rows={data.top_users.slice(0, 8).map((u) => ({ key: String(u.user_id), label: u.email, bucket: u }))}
              />
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            Prices last verified {data.pricing.verified_on} from{" "}
            <a href={data.pricing.source} target="_blank" rel="noreferrer" className="underline">
              OpenAI&apos;s pricing page
            </a>
            {data.total.search_credits > 0 && " and Tavily's"}. Only calls made after token logging was deployed are counted.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
