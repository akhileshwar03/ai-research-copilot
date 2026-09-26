"use client";

import { useState } from "react";
import { toast } from "sonner";

import { exportTableCsv } from "@/features/admin/lib/chart-export";

const PAGE_SIZE = 200;
const ROW_CAP = 10_000;

type Cell = string | number | boolean | null | undefined;

/** Exports every row matching the current filters (all pages), not just the visible page. */
export function useFullTableExport() {
  const [exporting, setExporting] = useState(false);

  const runExport = async <T,>(options: {
    fetchPage: (skip: number, limit: number) => Promise<{ rows: T[]; total: number }>;
    headers: string[];
    toRow: (item: T) => Cell[];
    filename: string;
    title: string;
  }) => {
    setExporting(true);
    try {
      const rows: T[] = [];
      let total = Number.POSITIVE_INFINITY;
      while (rows.length < total && rows.length < ROW_CAP) {
        const page = await options.fetchPage(rows.length, PAGE_SIZE);
        total = page.total;
        if (page.rows.length === 0) break;
        rows.push(...page.rows);
      }
      exportTableCsv({
        filename: options.filename,
        title: options.title,
        headers: options.headers,
        rows: rows.map(options.toRow),
      });
      if (total > rows.length) {
        toast.info(`Exported the first ${rows.length.toLocaleString()} of ${total.toLocaleString()} rows.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return { exporting, runExport };
}
