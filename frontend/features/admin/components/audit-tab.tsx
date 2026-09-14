"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { adminApi } from "@/services/api/admin-api";
import {
  Badge,
  Button,
  EmptyRow,
  INPUT_CLASS,
  Pager,
  ROW_CLASS,
  THEAD_CLASS,
  TableShell,
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

function prettyDetails(details: string | null): string {
  if (!details) return "";
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    return Object.entries(parsed)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(" · ");
  } catch {
    return details;
  }
}

function AuditLog() {
  const [action, setAction] = useState("");
  const [skip, setSkip] = useState(0);
  const limit = 50;
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-audit", { action, skip }],
    queryFn: () => adminApi.auditLog({ action, skip, limit }),
  });
  const entries = data?.entries ?? [];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-headline text-[15px] font-bold text-zinc-200">Admin audit log ({data?.total ?? 0})</h2>
        <div className="flex items-center gap-2">
          <select value={action} onChange={(e) => { setAction(e.target.value); setSkip(0); }} className={INPUT_CLASS}>
            {ACTION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <Button onClick={() => refetch()} disabled={isFetching}>{isFetching ? "Refreshing…" : "Refresh"}</Button>
        </div>
      </div>
      <TableShell>
        <thead className={THEAD_CLASS}>
          <tr>
            <Th>When</Th>
            <Th>Admin</Th>
            <Th>Action</Th>
            <Th>Target</Th>
            <Th>Details</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <EmptyRow colSpan={5}>Loading…</EmptyRow>
          ) : entries.length === 0 ? (
            <EmptyRow colSpan={5}>No admin actions recorded yet.</EmptyRow>
          ) : (
            entries.map((e) => (
              <tr key={e.id} className={ROW_CLASS}>
                <td className="whitespace-nowrap px-3 py-2.5 text-zinc-500">{formatDate(e.created_at)}</td>
                <td className="max-w-[200px] truncate px-3 py-2.5 text-zinc-300">{e.admin_email}</td>
                <td className="px-3 py-2.5"><Badge tone={e.action.endsWith("delete") ? "bad" : e.action.startsWith("settings") ? "info" : "neutral"}>{e.action}</Badge></td>
                <td className="max-w-[220px] truncate px-3 py-2.5 text-zinc-300">{e.target ?? "—"}</td>
                <td className="max-w-[360px] truncate px-3 py-2.5 text-zinc-500" title={prettyDetails(e.details)}>{prettyDetails(e.details) || "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
      <Pager skip={skip} limit={limit} total={data?.total ?? 0} onChange={setSkip} />
    </section>
  );
}

function UsageEvents() {
  const [tool, setTool] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [skip, setSkip] = useState(0);
  const limit = 50;
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-usage-events", { tool, errorsOnly, skip }],
    queryFn: () => adminApi.usageEvents({ tool, errors_only: errorsOnly, skip, limit }),
  });
  const events = data?.events ?? [];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-headline text-[15px] font-bold text-zinc-200">Recent tool requests ({data?.total ?? 0})</h2>
        <div className="flex items-center gap-2">
          <select value={tool} onChange={(e) => { setTool(e.target.value); setSkip(0); }} className={INPUT_CLASS}>
            {TOOL_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[12px] text-zinc-400">
            <input type="checkbox" checked={errorsOnly} onChange={(e) => { setErrorsOnly(e.target.checked); setSkip(0); }} />
            Errors only
          </label>
          <Button onClick={() => refetch()} disabled={isFetching}>{isFetching ? "Refreshing…" : "Refresh"}</Button>
        </div>
      </div>
      <TableShell>
        <thead className={THEAD_CLASS}>
          <tr>
            <Th>When</Th>
            <Th>Tool</Th>
            <Th>User</Th>
            <Th>Status</Th>
            <Th right>Duration</Th>
            <Th>Request id</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <EmptyRow colSpan={6}>Loading…</EmptyRow>
          ) : events.length === 0 ? (
            <EmptyRow colSpan={6}>No requests match.</EmptyRow>
          ) : (
            events.map((e) => (
              <tr key={e.id} className={ROW_CLASS}>
                <td className="whitespace-nowrap px-3 py-2.5 text-zinc-500">{formatDate(e.created_at)}</td>
                <td className="px-3 py-2.5 text-zinc-300">{TOOL_FILTERS.find((t) => t.value === e.tool)?.label ?? e.tool}</td>
                <td className="max-w-[200px] truncate px-3 py-2.5 text-zinc-400">{e.user_email ?? "anonymous"}</td>
                <td className="px-3 py-2.5"><Badge tone={e.ok ? "good" : e.status_code >= 500 ? "bad" : "warn"}>{e.status_code}</Badge></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{formatDuration(e.duration_ms)}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-zinc-600">{e.request_id?.slice(0, 8) ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
      <Pager skip={skip} limit={limit} total={data?.total ?? 0} onChange={setSkip} />
    </section>
  );
}

export function AuditTab() {
  return (
    <div className="space-y-8">
      <AuditLog />
      <UsageEvents />
    </div>
  );
}
