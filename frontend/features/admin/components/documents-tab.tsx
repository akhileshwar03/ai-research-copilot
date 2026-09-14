"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminApi, type AdminDocument } from "@/services/api/admin-api";
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
  formatBytes,
  formatDate,
  statusTone,
} from "@/features/admin/components/shared";

const STATUSES = ["all", "ready", "processing", "failed", "empty"] as const;

export function DocumentsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [skip, setSkip] = useState(0);
  const limit = 50;

  const params = { skip, limit, q: search, status };
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-documents", params],
    queryFn: () => adminApi.documents(params),
    refetchInterval: status === "processing" ? 5_000 : false,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-documents"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteDocument(id),
    onSuccess: (res) => {
      toast.success(res.message);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });
  const reingestMutation = useMutation({
    mutationFn: (id: string) => adminApi.reingestDocument(id),
    onSuccess: (res) => {
      toast.success(res.message);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Re-ingestion failed"),
  });

  const handleDelete = (doc: AdminDocument) => {
    if (window.confirm(`Delete "${doc.name}" (owner: ${doc.owner_email ?? "unknown"})? The file, its embeddings, and its record are removed. This cannot be undone.`)) {
      deleteMutation.mutate(doc.id);
    }
  };

  const documents = data?.documents ?? [];
  const total = data?.total ?? 0;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-headline text-[15px] font-bold text-zinc-200">Documents ({total})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSkip(0);
            }}
            placeholder="Search by name or owner…"
            className={`${INPUT_CLASS} w-60`}
          />
          <div className="flex gap-1 rounded-lg border border-[var(--border-subtle)] p-0.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatus(s);
                  setSkip(0);
                }}
                className={`rounded-md px-2.5 py-1 text-[12px] capitalize transition ${status === s ? "bg-[var(--surface-2)] text-[var(--text-primary)]" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                {s}
              </button>
            ))}
          </div>
          <Button onClick={() => refetch()} disabled={isFetching}>{isFetching ? "Refreshing…" : "Refresh"}</Button>
        </div>
      </div>

      <TableShell>
        <thead className={THEAD_CLASS}>
          <tr>
            <Th>Document</Th>
            <Th>Owner</Th>
            <Th>Status</Th>
            <Th right>Size</Th>
            <Th right>Pages</Th>
            <Th>Uploaded</Th>
            <Th right>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <EmptyRow colSpan={7}>Loading documents…</EmptyRow>
          ) : documents.length === 0 ? (
            <EmptyRow colSpan={7}>{search || status !== "all" ? "No documents match these filters" : "No documents uploaded yet"}</EmptyRow>
          ) : (
            documents.map((doc) => (
              <tr key={doc.id} className={ROW_CLASS}>
                <td className="max-w-[320px] px-3 py-2.5">
                  <p className="truncate text-zinc-200" title={doc.name}>
                    {doc.pinned && "📌 "}
                    {doc.name}
                  </p>
                  {doc.error_message && <p className="truncate text-[11px] text-red-400">{doc.error_message}</p>}
                </td>
                <td className="max-w-[220px] truncate px-3 py-2.5 text-zinc-400">{doc.owner_email ?? "—"}</td>
                <td className="px-3 py-2.5"><Badge tone={statusTone(doc.upload_status)}>{doc.upload_status}</Badge></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{formatBytes(doc.size_bytes)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{doc.page_count ?? "—"}</td>
                <td className="px-3 py-2.5 text-zinc-500">{formatDate(doc.created_at)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={() => reingestMutation.mutate(doc.id)}
                      disabled={doc.upload_status === "processing" || reingestMutation.isPending}
                      title="Drop existing embeddings and run ingestion again"
                    >
                      Re-ingest
                    </Button>
                    <Button variant="danger" onClick={() => handleDelete(doc)}>Delete</Button>
                  </div>
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
