"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { forwardedQuery } from "@/features/admin/lib/admin-query";

export interface PaletteItem {
  id: string;
  category: "Navigation" | "Metric Drilldown" | "Action";
  title: string;
  subtitle?: string;
  onSelect: () => void;
  shortcut?: string;
}

export function AdminCommandPalette({
  open,
  onClose,
  onSelectTab,
}: {
  open: boolean;
  onClose: () => void;
  onSelectTab: (tab: string) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const items: PaletteItem[] = [
    {
      id: "tab-overview",
      category: "Navigation",
      title: "Overview Command Center",
      subtitle: "Main system KPI vitals, insights, and telemetry charts",
      shortcut: "1",
      onSelect: () => {
        onSelectTab("overview");
        onClose();
      },
    },
    {
      id: "tab-users",
      category: "Navigation",
      title: "Users Management",
      subtitle: "Accounts list, identities, role and status toggles",
      shortcut: "2",
      onSelect: () => {
        onSelectTab("users");
        onClose();
      },
    },
    {
      id: "tab-documents",
      category: "Navigation",
      title: "Documents & Embeddings",
      subtitle: "Uploaded files, ingestion pipeline, vector storage",
      shortcut: "3",
      onSelect: () => {
        onSelectTab("documents");
        onClose();
      },
    },
    {
      id: "tab-settings",
      category: "Navigation",
      title: "Runtime Settings & Kill Switches",
      subtitle: "Platform limits, maintenance mode, branding logo",
      shortcut: "4",
      onSelect: () => {
        onSelectTab("settings");
        onClose();
      },
    },
    {
      id: "tab-audit",
      category: "Navigation",
      title: "Audit Log & Activity",
      subtitle: "Admin action logs, tool requests, latency traces",
      shortcut: "5",
      onSelect: () => {
        onSelectTab("audit");
        onClose();
      },
    },
    {
      id: "tab-system",
      category: "Navigation",
      title: "System Architecture & Health",
      subtitle: "Postgres, pgvector, Cloudflare R2, AI providers",
      shortcut: "6",
      onSelect: () => {
        onSelectTab("system");
        onClose();
      },
    },
    {
      id: "metric-requests",
      category: "Metric Drilldown",
      title: "Analyze: Tool Requests Throughput",
      subtitle: "Deep-dive 3D charts, daily breakdowns, and request trends",
      onSelect: () => {
        router.push(`/admin/analytics/requests${forwardedQuery(searchParams)}`);
        onClose();
      },
    },
    {
      id: "metric-errors",
      category: "Metric Drilldown",
      title: "Analyze: Error Rates & Exceptions",
      subtitle: "Tool failure spikes, 5xx errors, rate-limiting triggers",
      onSelect: () => {
        router.push(`/admin/analytics/errors${forwardedQuery(searchParams)}`);
        onClose();
      },
    },
    {
      id: "metric-signups",
      category: "Metric Drilldown",
      title: "Analyze: User Growth & Sign-ups",
      subtitle: "Registration momentum and conversion trajectory",
      onSelect: () => {
        router.push(`/admin/analytics/signups${forwardedQuery(searchParams)}`);
        onClose();
      },
    },
    {
      id: "metric-messages",
      category: "Metric Drilldown",
      title: "Analyze: Chat Messages Volume",
      subtitle: "Research Copilot interactive query traffic",
      onSelect: () => {
        router.push(`/admin/analytics/messages${forwardedQuery(searchParams)}`);
        onClose();
      },
    },
    {
      id: "action-chat",
      category: "Action",
      title: "Exit Admin: Open Main Chat App",
      subtitle: "Return to the user-facing Research Copilot workspace",
      onSelect: () => {
        router.push("/chat");
        onClose();
      },
    },
  ];

  const filtered = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase()) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase())),
  );

  const safeIdx = Math.min(selectedIdx, Math.max(0, filtered.length - 1));

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => (prev + 1) % Math.max(1, filtered.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[safeIdx]) {
          filtered[safeIdx].onSelect();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, filtered, safeIdx, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-20 backdrop-blur-md transition-all"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5">
          <svg className="h-5 w-5 text-[var(--marketing-accent-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            placeholder="Type a command, metric, or jump to tab… (Esc to close)"
            className="w-full bg-transparent text-[14px] font-medium text-[var(--text-primary)] placeholder-zinc-500 focus:outline-none"
          />
          <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">No matching commands found.</div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = safeIdx === idx;
              return (
                <div
                  key={item.id}
                  onClick={item.onSelect}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 transition-all ${
                    isSelected
                      ? "bg-[var(--surface-2)] text-[var(--text-primary)] ring-1 ring-[var(--border-medium)]"
                      : "text-zinc-300 hover:bg-[var(--surface-2)]/60"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--marketing-accent-text)]">
                        {item.category}
                      </span>
                      <p className="truncate text-[13px] font-bold">{item.title}</p>
                    </div>
                    {item.subtitle && <p className="mt-0.5 truncate text-[11.5px] text-zinc-400">{item.subtitle}</p>}
                  </div>
                  {item.shortcut && (
                    <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-zinc-400">
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Hints */}
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--surface-0)]/80 px-4 py-2 text-[11px] text-zinc-500">
          <span>Use ↑ ↓ to navigate, Enter to select</span>
          <span className="font-mono">⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
