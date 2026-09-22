"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CommandPalette } from "@/components/ui/command-palette";
import { ROUTE_TOOL, useAppConfig } from "@/features/shared/hooks/use-app-config";
import { WorkspaceProfileFooter } from "@/components/layout/workspace-profile-footer";
import { BrandMark } from "@/features/shared/components/brand-mark";

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

interface TopNavProps {
  /**
   * When provided (Chat), the global ⌘K shortcut is left to the caller's own
   * fully-wired sidebar search (documents + chats) instead of this bar's own
   * tools-only palette — see the sidebar's own search trigger for that one.
   * The visible "Search tools" button here always opens the tools-only
   * palette regardless, since those are two deliberately separate searches:
   * this bar finds a *tool*, the sidebar finds a *document or chat*.
   */
  onOpenPalette?: () => void;
}

/**
 * App-wide top bar: brand, the product switcher (moved here from the
 * sidebar so every product's own sidebar can dedicate its full height to
 * contextual content — documents/chats, conversation history, etc.), a
 * tools-only quick-jump search, and account access.
 */
export function TopNav({ onOpenPalette }: TopNavProps) {
  const pathname = usePathname();
  const { config } = useAppConfig();
  const hasOverride = typeof onOpenPalette === "function";
  const [toolsSearchOpen, setToolsSearchOpen] = useState(false);

  // The global ⌘K shortcut defers to the page's own richer search when one
  // exists (chat's document/chat palette); otherwise it opens this bar's
  // tools-only one. The visible button below is independent of this and
  // always opens the tools-only palette.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "k") return;
      e.preventDefault();
      if (hasOverride) onOpenPalette!();
      else setToolsSearchOpen((o) => !o);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasOverride, onOpenPalette]);

  return (
    <>
      <header className="glass-bar relative z-20 flex h-14 shrink-0 items-center gap-4 border-b px-4">
        {/* Brand — links to the public marketing/landing page, not back into the app;
            that's a deliberate, separate destination from the product-switcher tabs
            below, so it gets its own hover affordance like every other control here. */}
        <Link href="/" className="hover-surface flex shrink-0 items-center gap-2.5 rounded-lg px-1.5 py-1 transition">
          <BrandMark boxClassName="h-7 w-7 rounded-lg ring-1 ring-[var(--border-medium)]" />
          <p className="font-headline hidden text-[13px] font-bold text-[var(--text-primary)] sm:block">Querex</p>
        </Link>

        <div className="h-6 w-px shrink-0 bg-[var(--border-subtle)]" />

        {/* Product switcher */}
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-thin">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const tool = ROUTE_TOOL[item.href];
            const disabled = tool ? config.tools[tool] === false : false;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={disabled ? `${item.label} is temporarily unavailable` : undefined}
                className={[
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition",
                  active
                    ? "bg-[var(--surface-2)] text-[var(--text-primary)]"
                    : "hover-surface text-zinc-500",
                  disabled ? "opacity-60" : "",
                ].join(" ")}
                style={active ? { color: "var(--marketing-accent-text)" } : undefined}
              >
                <NavIcon d={item.path} />
                <span className="hidden md:inline">{item.label}</span>
                {disabled && (
                  <span className="hidden rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-400 lg:inline">
                    off
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Tools search — jumps between products only, not documents/chats */}
        <button
          onClick={() => setToolsSearchOpen(true)}
          title="Search tools"
          aria-label="Search tools"
          className="hover-surface flex shrink-0 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[12px] text-zinc-500 transition"
        >
          <SearchIcon />
          <span className="hidden lg:inline">Search tools…</span>
          {!hasOverride && (
            <kbd className="hidden rounded border border-[var(--border-medium)] bg-[var(--surface-2)] px-1 py-0.5 text-[10px] text-zinc-600 lg:inline">⌘K</kbd>
          )}
        </button>

        {/* Account */}
        <WorkspaceProfileFooter />
      </header>

      <CommandPalette open={toolsSearchOpen} onClose={() => setToolsSearchOpen(false)} />
    </>
  );
}
