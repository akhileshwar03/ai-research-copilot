"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CommandPalette } from "@/components/ui/command-palette";

interface NavItem {
  href: string;
  label: string;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/chat", label: "Chat", path: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { href: "/checker", label: "AI Checker", path: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/humanizer", label: "Humanizer", path: "M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" },
  { href: "/realtime", label: "Real-time AI", path: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" },
  { href: "/paper-analyzer", label: "Paper Analyzer", path: "M9 4.5v15m6-15v15M4.5 9h15M4.5 15h15" },
];

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

interface WorkspaceNavProps {
  /**
   * When provided (Chat), search opens the caller's own fully-wired
   * CommandPalette instance instead of this component's self-contained one.
   */
  onOpenPalette?: () => void;
}

export function WorkspaceNav({ onOpenPalette }: WorkspaceNavProps) {
  const pathname = usePathname();
  const hasOverride = typeof onOpenPalette === "function";
  const [selfPaletteOpen, setSelfPaletteOpen] = useState(false);

  useEffect(() => {
    if (hasOverride) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSelfPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasOverride]);

  const openPalette = () => (hasOverride ? onOpenPalette!() : setSelfPaletteOpen(true));

  return (
    <>
      <div className="shrink-0 space-y-3 border-b border-[var(--border-subtle)] px-3 py-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-1">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg ring-1 ring-[var(--border-medium)]"
            style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-headline truncate text-[13px] font-bold text-[var(--text-primary)] leading-tight">Querex</p>
            <p className="text-[10px] text-zinc-600 leading-tight">AI workspace</p>
          </div>
        </div>

        {/* Search / command palette trigger */}
        <button
          onClick={openPalette}
          className="hover-surface flex w-full items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] px-2.5 py-2 text-[12px] text-zinc-500 transition"
        >
          <SearchIcon />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-[var(--border-medium)] bg-[var(--surface-2)] px-1 py-0.5 text-[10px] text-zinc-600">⌘K</kbd>
        </button>

        {/* Product nav */}
        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                  active
                    ? "bg-[var(--surface-2)] text-[var(--text-primary)]"
                    : "hover-surface text-zinc-500",
                ].join(" ")}
                style={active ? { color: "var(--marketing-accent-text)" } : undefined}
              >
                <NavIcon d={item.path} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {!hasOverride && (
        <CommandPalette
          open={selfPaletteOpen}
          onClose={() => setSelfPaletteOpen(false)}
        />
      )}
    </>
  );
}
