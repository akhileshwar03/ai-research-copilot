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
  TableShell,
  TableSkeletonRows,
  Th,
  formatBytes,
  formatDate,
  statusTone,
} from "@/features/admin/components/shared";
import { DynamicChart } from "@/features/admin/components/dynamic-chart";
import { exportTableCsv } from "@/features/admin/lib/chart-export";

const STATUSES = ["all", "ready", "processing", "failed", "empty"] as const;

export function DocumentsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [sizeFilter, setSizeFilter] = useState<"all" | "small" | "medium" | "large">("all");
  const [density, setDensity] = useState<"compact" | "normal">("compact");
  const [showColMenu, setShowColMenu] = useState(false);
  const [visibleCols, setVisibleCols] = useState({
    size: true,
    pages: true,
    uploaded: true,
  });
  const [skip, setSkip] = useState(0);
  const limit = 50;

  const params = { skip, limit, q: search, status };
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-documents", params],
    queryFn: () => adminApi.documents(params),
    refetchInterval: status === "processing" ? 5_000 : false,
  });


  const { data: analytics } = useQuery({
    queryKey: ["admin-analytics", { days: 30 }],
    queryFn: () => adminApi.analytics({ days: 30 }),
    refetchInterval: 120_000,
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
    if (
      window.confirm(
        `Delete "${doc.name}" (owner: ${doc.owner_email ?? "unknown"})? The file, its embeddings, and its record are removed. This cannot be undone.`,
      )
    ) {
      deleteMutation.mutate(doc.id);
    }
  };

  const rawDocuments = data?.documents ?? [];
  const total = data?.total ?? 0;

  const documents = rawDocuments.filter((doc) => {
    if (sizeFilter === "small") return doc.size_bytes < 1024 * 1024;
    if (sizeFilter === "medium") return doc.size_bytes >= 1024 * 1024 && doc.size_bytes <= 10 * 1024 * 1024;
    if (sizeFilter === "large") return doc.size_bytes > 10 * 1024 * 1024;
    return true;
  });

  const pageBytes = rawDocuments.reduce((acc, d) => acc + (d.size_bytes || 0), 0);

  const cellPy = density === "compact" ? "py-1.5" : "py-3";

  const handleExportCsv = () => {
    const headers = ["ID", "Filename", "OwnerEmail", "Status", "SizeBytes", "PageCount", "UploadedAt"];
    const rows = documents.map((doc) => [
      doc.id,
      doc.name,
      doc.owner_email ?? "",
      doc.upload_status,
      doc.size_bytes,
      doc.page_count ?? "",
      doc.created_at ?? "",
    ]);
    exportTableCsv({
      filename: `querex-documents-${new Date().toISOString().slice(0, 10)}.csv`,
      title: "Documents & Embeddings Ingestion",
      headers,
      rows,
    });
  };

  const statusCounts = analytics?.documents_by_status ?? {};
  const statusData = Object.entries(statusCounts).map(([k, v]) => ({
    label: k,
    value: v,
    color:
      k === "ready"
        ? "#059669"
        : k === "processing"
          ? "#0284c7"
          : k === "failed"
            ? "#e11d48"
            : "#71717a",
  }));

  const smallCount = rawDocuments.filter((d) => d.size_bytes < 1024 * 1024).length;
  const medCount = rawDocuments.filter(
    (d) => d.size_bytes >= 1024 * 1024 && d.size_bytes <= 10 * 1024 * 1024,
  ).length;
  const largeCount = rawDocuments.filter((d) => d.size_bytes > 10 * 1024 * 1024).length;
  const sizeData = [
    { label: "< 1 MB", value: smallCount, color: "#059669" },
    { label: "1 – 10 MB", value: medCount, color: "#d9793a" },
    { label: "> 10 MB", value: largeCount, color: "#7c3aed" },
  ];

  return (
    <section className="space-y-4">
      {/* Visual Analytics Strip for Documents */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <DynamicChart
          id="docs-upload-velocity"
          title="30-Day Upload Velocity"
          subtitle="Documents parsed & embedded daily"
          data={(analytics?.series ?? []).map((d) => ({ label: d.date, value: d.documents }))}
          color="#7c3aed"
          unit="docs"
          height={140}
          allow3D={false}
          allowedViews={["bar", "line", "area"]}
        />
        <DynamicChart
          id="docs-status-donut"
          title="Ingestion Status"
          subtitle="Pipeline parsing breakdown"
          data={statusData.length > 0 ? statusData : [{ label: "ready", value: total, color: "#059669" }]}
          height={140}
          allow3D={true}
          isComposition={true}
        />
        <DynamicChart
          id="docs-size-histogram"
          title="File Size Distribution"
          subtitle="Document byte footprint classes"
          data={sizeData}
          height={140}
          allow3D={true}
          isComposition={true}
        />
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-headline text-[15px] font-bold text-[var(--text-primary)]">
            Documents
          </h2>
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-bold font-data text-zinc-300">
            {total.toLocaleString()} total
          </span>
          <span className="hidden sm:inline-block text-[11.5px] text-zinc-500 font-data">
            ({formatBytes(pageBytes)} in page)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search by filename or owner */}
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSkip(0);
              }}
              placeholder="Search filename or owner…"
              className={`${INPUT_CLASS} w-52 pl-8 pr-7 sm:w-60`}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSkip(0);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Segmented Buttons */}
          <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-0.5 shadow-xs">
            {STATUSES.map((s) => {
              const isSelected = status === s;
              return (
                <button
                  key={s}
                  onClick={() => {
                    setStatus(s);
                    setSkip(0);
                  }}
                  className={`rounded-md px-2.5 py-1 text-[12px] font-semibold capitalize transition-all duration-150 ${
                    isSelected
                      ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)] shadow-xs ring-1 ring-[var(--border-medium)]"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {/* Size Filter Dropdown */}
          <select
            value={sizeFilter}
            onChange={(e) => setSizeFilter(e.target.value as "all" | "small" | "medium" | "large")}
            className={`${INPUT_CLASS} cursor-pointer text-[12px] font-medium text-zinc-300`}
            title="Filter by document file size"
          >
            <option value="all">All sizes</option>
            <option value="small">&lt; 1 MB</option>
            <option value="medium">1 – 10 MB</option>
            <option value="large">&gt; 10 MB</option>
          </select>

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

          {/* Column Chooser */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColMenu((p) => !p)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[11px] font-bold text-zinc-300 hover:bg-[var(--surface-2)]"
              title="Choose visible columns"
            >
              Cols ▾
            </button>
            {showColMenu && (
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-1)] p-2.5 shadow-xl">
                <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
                  Visible Columns
                </p>
                <div className="space-y-1.5 text-xs text-zinc-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleCols.size}
                      onChange={(e) => setVisibleCols((c) => ({ ...c, size: e.target.checked }))}
                    />
                    <span>Size</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleCols.pages}
                      onChange={(e) => setVisibleCols((c) => ({ ...c, pages: e.target.checked }))}
                    />
                    <span>Pages</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleCols.uploaded}
                      onChange={(e) => setVisibleCols((c) => ({ ...c, uploaded: e.target.checked }))}
                    />
                    <span>Uploaded Date</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Refresh Button */}
          <Button
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh documents list"
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

          {/* Export CSV Button */}
          <Button
            size="sm"
            onClick={handleExportCsv}
            title="Export filtered documents to CSV"
          >
            CSV
          </Button>
        </div>
      </div>

      {/* Dense Documents Table */}
      <TableShell>
        <thead>
          <tr>
            <Th>Document Name</Th>
            <Th>Owner</Th>
            <Th>Status</Th>
            {visibleCols.size && <Th right>Size</Th>}
            {visibleCols.pages && <Th right>Pages</Th>}
            {visibleCols.uploaded && <Th>Uploaded</Th>}
            <Th right>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <TableSkeletonRows colSpan={4 + (visibleCols.size ? 1 : 0) + (visibleCols.pages ? 1 : 0) + (visibleCols.uploaded ? 1 : 0)} rows={8} />
          ) : documents.length === 0 ? (
            <EmptyRow colSpan={4 + (visibleCols.size ? 1 : 0) + (visibleCols.pages ? 1 : 0) + (visibleCols.uploaded ? 1 : 0)}>
              {search || status !== "all" || sizeFilter !== "all"
                ? "No documents match the current search or status/size filter."
                : "No documents have been uploaded to the system yet."}
            </EmptyRow>
          ) : (
            documents.map((doc) => (
              <tr key={doc.id} className={ROW_CLASS}>
                {/* Document Name */}
                <td className={`max-w-[340px] px-3.5 ${cellPy}`}>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-zinc-500">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-zinc-200" title={doc.name}>
                        {doc.pinned && <span className="mr-1">📌</span>}
                        {doc.name}
                      </p>
                      {doc.error_message && (
                        <p className="mt-0.5 truncate text-[11px] font-medium text-rose-400" title={doc.error_message}>
                          Error: {doc.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Owner */}
                <td className={`max-w-[200px] truncate px-3.5 ${cellPy} text-zinc-400`} title={doc.owner_email ?? "unknown"}>
                  {doc.owner_email ? (
                    <span className="font-medium text-zinc-300">{doc.owner_email}</span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>

                {/* Status */}
                <td className={`px-3.5 ${cellPy}`}>
                  <Badge tone={statusTone(doc.upload_status)} dot>
                    {doc.upload_status}
                  </Badge>
                </td>

                {/* File Size */}
                {visibleCols.size && (
                  <td className={`px-3.5 ${cellPy} text-right font-data font-semibold tabular-nums text-zinc-300`}>
                    {formatBytes(doc.size_bytes)}
                  </td>
                )}

                {/* Page Count */}
                {visibleCols.pages && (
                  <td className={`px-3.5 ${cellPy} text-right font-data tabular-nums text-zinc-300`}>
                    {doc.page_count != null ? doc.page_count : <span className="text-zinc-600">—</span>}
                  </td>
                )}

                {/* Uploaded Date */}
                {visibleCols.uploaded && (
                  <td className={`px-3.5 ${cellPy} text-zinc-400`}>
                    {formatDate(doc.created_at)}
                  </td>
                )}

                {/* Actions */}
                <td className={`px-3.5 ${cellPy}`}>
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => reingestMutation.mutate(doc.id)}
                      disabled={doc.upload_status === "processing" || reingestMutation.isPending}
                      title="Drop existing embeddings and re-run chunking and vector ingestion"
                    >
                      <svg
                        className={`h-3.5 w-3.5 ${reingestMutation.isPending ? "animate-spin" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                      <span>Re-ingest</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleDelete(doc)}
                      title="Permanently delete document file and embeddings"
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>

      {/* Pagination */}
      <Pager skip={skip} limit={limit} total={total} onChange={setSkip} />
    </section>
  );
}
