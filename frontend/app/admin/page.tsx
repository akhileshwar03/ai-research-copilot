"use client";

import { Suspense, useEffect, useState } from "react";
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

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "documents", label: "Documents" },
  { key: "settings", label: "Settings" },
  { key: "audit", label: "Audit & activity" },
  { key: "system", label: "System" },
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

  const { data: me, isLoading: isMeLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => adminApi.me(),
    enabled: isReady && isAuthenticated,
  });

  const isForbidden = Boolean(me && !me.is_admin);

  useEffect(() => {
    if (isForbidden) router.replace("/chat");
  }, [isForbidden, router]);

  const selectTab = (next: TabKey) => {
    setTab(next);
    router.replace(next === "overview" ? "/admin" : `/admin?tab=${next}`);
  };

  if (!isReady || !isAuthenticated || isMeLoading) {
    return (
      <div className="relative flex h-screen items-center justify-center">
        <AtmosphereBackground variant="calm" />
        <div className="relative z-10 h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--marketing-accent)" }} />
      </div>
    );
  }

  if (isForbidden) return null;

  return (
    <div className="relative min-h-screen px-6 py-8">
      <AtmosphereBackground variant="calm" />
      <div className="relative z-10 mx-auto max-w-6xl space-y-6">
        <header className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}>
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <h1 className="font-headline text-xl font-bold text-[var(--text-primary)]">Admin panel</h1>
              <p className="mt-0.5 text-[13px] text-zinc-500">Signed in as {me?.email} · every change is written to the audit log</p>
            </div>
          </div>
          <button onClick={() => router.push("/chat")} className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[13px] text-zinc-300 hover-surface">
            ← Back to app
          </button>
        </header>

        <nav className="glass-card flex flex-wrap gap-1 rounded-xl p-1" aria-label="Admin sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => selectTab(t.key)}
              className={[
                "rounded-lg px-3.5 py-2 text-[13px] font-medium transition",
                tab === t.key ? "bg-[var(--surface-2)] text-[var(--text-primary)]" : "text-zinc-500 hover:text-zinc-300",
              ].join(" ")}
              style={tab === t.key ? { color: "var(--marketing-accent-text)" } : undefined}
              aria-current={tab === t.key ? "page" : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "overview" && <OverviewTab />}
        {tab === "users" && <UsersTab currentEmail={me?.email} />}
        {tab === "documents" && <DocumentsTab />}
        {tab === "settings" && <SettingsTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "system" && <SystemTab />}
      </div>
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
