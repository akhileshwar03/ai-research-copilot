"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import { adminApi } from "@/services/api/admin-api";
import { AtmosphereBackground } from "@/features/shared/components/atmosphere-background";
import { OverviewTab } from "@/features/admin/components/overview-tab";
import { UsersTab } from "@/features/admin/components/users-tab";
import { DocumentsTab } from "@/features/admin/components/documents-tab";
import { SettingsTab } from "@/features/admin/components/settings-tab";
import { AuditTab } from "@/features/admin/components/audit-tab";
import { SystemTab } from "@/features/admin/components/system-tab";
import { AdminCommandPalette } from "@/features/admin/components/admin-command-palette";

const TABS = [
  {
    key: "overview",
    label: "Overview",
    shortcut: "1",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
  },
  {
    key: "users",
    label: "Users",
    shortcut: "2",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    key: "documents",
    label: "Documents",
    shortcut: "3",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    key: "settings",
    label: "Settings",
    shortcut: "4",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
  {
    key: "audit",
    label: "Audit & activity",
    shortcut: "5",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
  },
  {
    key: "system",
    label: "System",
    shortcut: "6",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.75 5.1a3 3 0 012.4-1.35h7.7a3 3 0 012.4 1.35l2.1 3.45a4.5 4.5 0 01.9 2.7m-16.5 0h16.5" />
      </svg>
    ),
  },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isReady, isAuthenticated } = useAuthGuard();

  const requested = searchParams.get("tab");
  const [tab, setTab] = useState<TabKey>(isTabKey(requested) ? requested : "overview");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { data: me, isLoading: isMeLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => adminApi.me(),
    enabled: isReady && isAuthenticated,
  });

  const isForbidden = Boolean(me && !me.is_admin);

  useEffect(() => {
    if (isForbidden) router.replace("/chat");
  }, [isForbidden, router]);

  const selectTab = useCallback(
    (next: TabKey) => {
      setTab(next);
      router.replace(next === "overview" ? "/admin" : `/admin?tab=${next}`);
    },
    [router],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      if (!isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === "1") {
          e.preventDefault();
          selectTab("overview");
        } else if (e.key === "2") {
          e.preventDefault();
          selectTab("users");
        } else if (e.key === "3") {
          e.preventDefault();
          selectTab("documents");
        } else if (e.key === "4") {
          e.preventDefault();
          selectTab("settings");
        } else if (e.key === "5") {
          e.preventDefault();
          selectTab("audit");
        } else if (e.key === "6") {
          e.preventDefault();
          selectTab("system");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectTab]);

  if (!isReady || !isAuthenticated || isMeLoading) {
    return (
      <div className="relative flex h-screen items-center justify-center">
        <AtmosphereBackground variant="calm" />
        <div
          className="relative z-10 h-7 w-7 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--marketing-accent)" }}
        />
      </div>
    );
  }

  if (isForbidden) return null;

  return (
    <div className="admin-console relative min-h-screen px-3 py-4 sm:px-6 sm:py-7">
      <AtmosphereBackground variant="calm" />
      <div className="relative z-10 mx-auto max-w-7xl space-y-4 sm:space-y-6">
        {/* Top Header Card */}
        <header className="glass-card flex flex-wrap items-center justify-between gap-3.5 rounded-2xl border border-[var(--border-subtle)] px-4 py-3.5 shadow-sm sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-xs"
              style={{
                backgroundColor: "var(--marketing-accent-soft)",
                color: "var(--marketing-accent-text)",
              }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-headline text-lg font-bold tracking-tight text-[var(--text-primary)] sm:text-xl">
                  Admin Console
                </h1>
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Live
                </span>
              </div>
              <p className="mt-0.5 break-words text-[12px] text-zinc-400">
                Signed in as <span className="font-semibold text-zinc-200">{me?.email}</span> · actions logged
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1.5 text-[12.5px] font-semibold text-zinc-300 transition hover:border-[var(--border-medium)] hover:bg-[var(--surface-2)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marketing-accent)]"
              title="Open Command Palette (Cmd+K / Ctrl+K)"
            >
              <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <span>Command Palette</span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                ⌘K
              </kbd>
            </button>

            <button
              onClick={() => router.push("/chat")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1.5 text-[12.5px] font-semibold text-zinc-300 transition hover:border-[var(--border-medium)] hover:bg-[var(--surface-2)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marketing-accent)]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <span>Back to app</span>
            </button>
          </div>
        </header>

        {/* Tab Navigation Pill Bar */}
        <nav
          className="glass-card flex items-center gap-1.5 overflow-x-auto rounded-xl border border-[var(--border-subtle)] p-1.5 shadow-xs scrollbar-thin"
          aria-label="Admin sections"
        >
          {TABS.map((t) => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => selectTab(t.key)}
                className={[
                  "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marketing-accent)]",
                  isActive
                    ? "bg-[var(--surface-2)] text-[var(--text-primary)] shadow-xs ring-1 ring-[var(--border-medium)]"
                    : "text-zinc-400 hover:bg-[var(--surface-1)]/60 hover:text-zinc-200",
                ].join(" ")}
                style={isActive ? { color: "var(--marketing-accent-text)" } : undefined}
                aria-current={isActive ? "page" : undefined}
              >
                <span className={isActive ? "text-[var(--marketing-accent-text)]" : "text-zinc-500"}>
                  {t.icon}
                </span>
                <span>{t.label}</span>
                <span className="hidden sm:inline-block rounded bg-[var(--surface-0)]/60 px-1 font-mono text-[9px] text-zinc-500">
                  {t.shortcut}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Tab Content Panes */}
        <main className="w-full min-w-0">
          {tab === "overview" && <OverviewTab />}
          {tab === "users" && <UsersTab currentEmail={me?.email} />}
          {tab === "documents" && <DocumentsTab />}
          {tab === "settings" && <SettingsTab />}
          {tab === "audit" && <AuditTab />}
          {tab === "system" && <SystemTab />}
        </main>
      </div>

      {/* Global Command Palette */}
      <AdminCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelectTab={(nextTab) => selectTab(nextTab as TabKey)}
      />
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageInner />
    </Suspense>
  );
}
