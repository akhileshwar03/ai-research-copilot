"use client";

import { useQuery } from "@tanstack/react-query";

import { adminApi } from "@/services/api/admin-api";

/** Live operational alerts (last hour of traffic). Renders nothing when everything is healthy. */
export function AlertsBanner({ onOpenAudit }: { onOpenAudit: () => void }) {
  const { data } = useQuery({
    queryKey: ["admin-alerts"],
    queryFn: adminApi.alerts,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
  const alerts = data?.alerts ?? [];
  if (alerts.length === 0) return null;

  return (
    <section
      role="alert"
      aria-label="Operational alerts"
      className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-rose-600 dark-theme:text-rose-300">
          {alerts.length} active alert{alerts.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={onOpenAudit}
          className="rounded-md border border-rose-500/40 px-2.5 py-1 text-[11.5px] font-semibold text-rose-700 transition hover:bg-rose-500/10 dark-theme:text-rose-200"
        >
          View request log
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {alerts.map((a) => (
          <li key={a.id} className="text-[12.5px] text-[var(--text-primary)]">
            <span className="font-bold">{a.title}.</span> <span className="text-zinc-500">{a.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
