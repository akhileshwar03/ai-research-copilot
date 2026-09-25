"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminApi } from "@/services/api/admin-api";
import {
  Badge,
  Button,
  EmptyRow,
  INPUT_CLASS,
  Pager,
  ROW_CLASS,
  TableShell,
  TableSkeletonRows,
  Th,
  formatDate,
  formatDuration,
} from "@/features/admin/components/shared";

const ACTION_FILTERS = [
  { value: "", label: "All actions" },
  { value: "user.", label: "Users" },
  { value: "document.", label: "Documents" },
  { value: "settings.", label: "Settings" },
  { value: "retention.", label: "Retention" },
];

const TOOL_FILTERS = [
  { value: "", label: "All tools" },
  { value: "research_copilot", label: "Research Copilot" },
  { value: "upload", label: "Upload" },
  { value: "humanizer", label: "Humanizer" },
  { value: "humanizer_ultra", label: "Humanizer (Ultra)" },
  { value: "checker", label: "AI Checker" },
  { value: "writing_feedback", label: "Writing Feedback" },
  { value: "realtime", label: "Real-time AI" },
  { value: "extract", label: "Text extraction" },
  { value: "paper_analyzer", label: "Paper Analyzer" },
];

function actionTone(action: string): "good" | "warn" | "bad" | "info" | "neutral" {
  if (action.includes("delete") || action.includes("revoke") || action.includes("suspend")) return "bad";
  if (action.startsWith("settings.")) return "info";
  if (action.includes("reinstate") || action.includes("verify") || action.includes("promote")) return "good";
  return "neutral";
}

function parseDetails(details: string | null): [string, string][] | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    return Object.entries(parsed).map(([k, v]) => [
      k,
      typeof v === "object" ? JSON.stringify(v) : String(v),
    ]);
  } catch {
    return null;
  }
}

function FormattedDetails({ details }: { details: string | null }) {
  if (!details) return <span className="text-zinc-600">—</span>;
  const entries = parseDetails(details);
  if (!entries || entries.length === 0) {
    return <span className="text-zinc-400">{details}</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-0.5">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex items-center gap-1 rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[11px] font-medium"
          title={`${k}: ${v}`}
        >
          <span className="text-zinc-400">{k}:</span>
          <span className="font-mono text-zinc-200">{v}</span>
        </span>
      ))}
    </div>
  );
}

function AuditLog() {
  const [action, setAction] = useState("");
  const [density, setDensity] = useState<"compact" | "normal">("compact");
  const [skip, setSkip] = useState(0);
  const limit = 50;
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-audit", { action, skip }],
    queryFn: () => adminApi.auditLog({ action, skip, limit }),
  });
  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;

  const cellPy = density === "compact" ? "py-1.5" : "py-3";

  return (
    <section className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-headline text-[15px] font-bold text-[var(--text-primary)]">
            Admin Audit Trail
          </h2>
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-0.5 font-data text-[11px] font-bold text-zinc-300">
            {total.toLocaleString()} events
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Action Filter Pills */}
          <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-0.5 shadow-xs">
            {ACTION_FILTERS.map((f) => {
              const isSelected = action === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => {
                    setAction(f.value);
                    setSkip(0);
                  }}
                  className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-all duration-150 ${
                    isSelected
                      ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)] shadow-xs ring-1 ring-[var(--border-medium)]"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Density Toggle */}
          <div className="flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-0.5">
            <button
              type="button"
              onClick={() => setDensity("compact")}
              className={`rounded px-2 py-1 text-[11px] font-bold ${
                density === "compact"
                  ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Compact density"
            >
              Compact
            </button>
            <button
              type="button"
              onClick={() => setDensity("normal")}
              className={`rounded px-2 py-1 text-[11px] font-bold ${
                density === "normal"
                  ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Normal density"
            >
              Normal
            </button>
          </div>

          <Button
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh audit log"
          >
            <svg
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span>{isFetching ? "Refreshing…" : "Refresh"}</span>
          </Button>
        </div>
      </div>

      <TableShell maxHeight="480px">
        <thead>
          <tr>
            <Th className="w-44">Timestamp</Th>
            <Th className="w-52">Admin</Th>
            <Th className="w-44">Action</Th>
            <Th className="w-48">Target</Th>
            <Th>Details</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <TableSkeletonRows colSpan={5} rows={8} />
          ) : entries.length === 0 ? (
            <EmptyRow colSpan={5}>
              No admin actions recorded for the selected filter.
            </EmptyRow>
          ) : (
            entries.map((e) => (
              <tr key={e.id} className={ROW_CLASS}>
                <td className={`whitespace-nowrap px-3.5 ${cellPy} font-data text-zinc-400`}>
                  {formatDate(e.created_at)}
                </td>
                <td
                  className={`max-w-[200px] truncate px-3.5 ${cellPy} font-semibold text-zinc-200 cursor-pointer hover:text-white`}
                  title={`${e.admin_email} (click to copy)`}
                  onClick={() => {
                    navigator.clipboard.writeText(e.admin_email);
                    toast.success("Copied admin email");
                  }}
                >
                  {e.admin_email}
                </td>
                <td className={`px-3.5 ${cellPy}`}>
                  <Badge tone={actionTone(e.action)} dot>
                    {e.action}
                  </Badge>
                </td>
                <td className={`max-w-[200px] truncate px-3.5 ${cellPy} font-mono text-[11.5px] text-zinc-300`} title={e.target ?? "—"}>
                  {e.target ?? "—"}
                </td>
                <td className={`px-3.5 ${cellPy}`}>
                  <FormattedDetails details={e.details} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
      <Pager skip={skip} limit={limit} total={total} onChange={setSkip} />
    </section>
  );
}

function UsageEvents() {
  const [tool, setTool] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [density, setDensity] = useState<"compact" | "normal">("compact");
  const [skip, setSkip] = useState(0);
  const limit = 50;
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-usage-events", { tool, errorsOnly, skip }],
    queryFn: () => adminApi.usageEvents({ tool, errors_only: errorsOnly, skip, limit }),
  });
  const events = data?.events ?? [];
  const total = data?.total ?? 0;

  const cellPy = density === "compact" ? "py-1.5" : "py-3";

  return (
    <section className="space-y-3.5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-headline text-[15px] font-bold text-[var(--text-primary)]">
            Recent Tool Requests
          </h2>
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-0.5 font-data text-[11px] font-bold text-zinc-300">
            {total.toLocaleString()} calls
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={tool}
            onChange={(e) => {
              setTool(e.target.value);
              setSkip(0);
            }}
            className={`${INPUT_CLASS} cursor-pointer font-medium text-zinc-300`}
          >
            {TOOL_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1.5 text-[12px] font-semibold text-zinc-300 transition hover:bg-[var(--surface-2)]">
            <input
              type="checkbox"
              checked={errorsOnly}
              onChange={(e) => {
                setErrorsOnly(e.target.checked);
                setSkip(0);
              }}
              className="h-3.5 w-3.5 rounded border-[var(--border-medium)] bg-[var(--surface-2)] text-[var(--marketing-accent)] focus:ring-[var(--marketing-accent)]"
            />
            <span className={errorsOnly ? "text-rose-400" : ""}>Errors only</span>
          </label>

          {/* Density Toggle */}
          <div className="flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-0.5">
            <button
              type="button"
              onClick={() => setDensity("compact")}
              className={`rounded px-2 py-1 text-[11px] font-bold ${
                density === "compact"
                  ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Compact density"
            >
              Compact
            </button>
            <button
              type="button"
              onClick={() => setDensity("normal")}
              className={`rounded px-2 py-1 text-[11px] font-bold ${
                density === "normal"
                  ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Normal density"
            >
              Normal
            </button>
          </div>

          <Button
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh tool request events"
          >
            <svg
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span>{isFetching ? "Refreshing…" : "Refresh"}</span>
          </Button>
        </div>
      </div>

      <TableShell maxHeight="480px">
        <thead>
          <tr>
            <Th className="w-44">When</Th>
            <Th className="w-48">Tool</Th>
            <Th className="w-56">User</Th>
            <Th className="w-28">Status</Th>
            <Th right className="w-28">Duration</Th>
            <Th className="w-32">Request ID</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <TableSkeletonRows colSpan={6} rows={8} />
          ) : events.length === 0 ? (
            <EmptyRow colSpan={6}>
              {errorsOnly
                ? "No error requests recorded for this tool."
                : "No tool request events logged yet."}
            </EmptyRow>
          ) : (
            events.map((e) => {
              const status = e.status_code;
              const tone = e.ok ? "good" : status >= 500 ? "bad" : "warn";
              const isSlow = e.duration_ms > 2000;
              const isFast = e.duration_ms < 300;
              return (
                <tr key={e.id} className={ROW_CLASS}>
                  <td className={`whitespace-nowrap px-3.5 ${cellPy} font-data text-zinc-400`}>
                    {formatDate(e.created_at)}
                  </td>
                  <td className={`px-3.5 ${cellPy} font-semibold text-zinc-200`}>
                    {TOOL_FILTERS.find((t) => t.value === e.tool)?.label ?? e.tool}
                  </td>
                  <td
                    className={`max-w-[200px] truncate px-3.5 ${cellPy} text-zinc-400 cursor-pointer hover:text-zinc-200`}
                    title={e.user_email ? `${e.user_email} (click to copy)` : "anonymous"}
                    onClick={() => {
                      if (e.user_email) {
                        navigator.clipboard.writeText(e.user_email);
                        toast.success("Copied user email");
                      }
                    }}
                  >
                    {e.user_email ?? <span className="text-zinc-600">anonymous</span>}
                  </td>
                  <td className={`px-3.5 ${cellPy}`}>
                    <Badge tone={tone} dot>
                      {status} {e.ok ? "OK" : ""}
                    </Badge>
                  </td>
                  <td className={`px-3.5 ${cellPy} text-right font-data font-semibold tabular-nums`}>
                    <span
                      className={
                        isSlow
                          ? "text-rose-400"
                          : isFast
                            ? "text-emerald-400"
                            : "text-zinc-300"
                      }
                    >
                      {formatDuration(e.duration_ms)}
                    </span>
                  </td>
                  <td
                    className={`px-3.5 ${cellPy} font-mono text-[11px] text-zinc-500 cursor-pointer hover:text-zinc-300`}
                    title={e.request_id ? `${e.request_id} (click to copy)` : ""}
                    onClick={() => {
                      if (e.request_id) {
                        navigator.clipboard.writeText(e.request_id);
                        toast.success("Copied request ID");
                      }
                    }}
                  >
                    {e.request_id?.slice(0, 8) ?? "—"}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableShell>
      <Pager skip={skip} limit={limit} total={total} onChange={setSkip} />
    </section>
  );
}

export function AuditTab() {
  return (
    <div className="space-y-8 divide-y divide-[var(--border-subtle)]">
      <AuditLog />
      <UsageEvents />
    </div>
  );
}
