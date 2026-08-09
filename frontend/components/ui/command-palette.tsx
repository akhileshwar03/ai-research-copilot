"use client";

import { Dialog } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { ChatSession } from "@/shared/types/chat";
import type { DocumentItem } from "@/shared/types/api";
import { PlusIcon } from "@/features/shared/components/icons";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  sessions?: ChatSession[];
  documents?: DocumentItem[];
  activeSessionId?: number | null;
  onSelectSession?: (id: number) => void;
  onNewSession?: () => void;
  onSelectDocument?: (id: string) => void;
  onUploadDocument?: () => void;
}

interface CommandItem {
  id: string;
  type: "session" | "document" | "action" | "nav";
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  onSelect: () => void;
  active?: boolean;
}

const PRODUCTS = [
  { href: "/chat", label: "Chat", sublabel: "Ask your documents", path: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { href: "/checker", label: "AI Checker", sublabel: "Detect AI-generated text", path: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/humanizer", label: "Humanizer", sublabel: "Rewrite AI-sounding text", path: "M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" },
  { href: "/realtime", label: "Real-time AI", sublabel: "Web-grounded live search", path: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" },
] as const;

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function SessionIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function KbdHint({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((k) => (
        <kbd key={k} className="flex h-5 min-w-[20px] items-center justify-center rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-1 text-[10px] font-mono text-zinc-600">
          {k}
        </kbd>
      ))}
    </div>
  );
}

export function CommandPalette({
  open, onClose,
  sessions = [], documents = [],
  activeSessionId = null,
  onSelectSession, onNewSession,
  onSelectDocument, onUploadDocument,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (open) { setQuery(""); setActiveIndex(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const q = query.toLowerCase().trim();

    const actions: CommandItem[] = [];
    if (onNewSession) {
      actions.push({
        id: "new-session",
        type: "action",
        label: "New Chat",
        sublabel: "Start a fresh conversation",
        icon: <PlusIcon strokeWidth={2} />,
        onSelect: () => { onNewSession(); onClose(); },
      });
    }
    if (onUploadDocument) {
      actions.push({
        id: "upload-doc",
        type: "action",
        label: "Upload PDF",
        sublabel: "Add a document to your workspace",
        icon: <UploadIcon />,
        onSelect: () => { onUploadDocument(); onClose(); },
      });
    }

    const navItems: CommandItem[] = PRODUCTS
      .filter((p) => p.href !== pathname)
      .filter((p) => !q || p.label.toLowerCase().includes(q) || p.sublabel.toLowerCase().includes(q))
      .map((p) => ({
        id: `nav-${p.href}`,
        type: "nav" as const,
        label: p.label,
        sublabel: p.sublabel,
        icon: <NavIcon d={p.path} />,
        onSelect: () => { router.push(p.href); onClose(); },
      }));

    const sessionItems: CommandItem[] = onSelectSession
      ? sessions
          .filter((s) => !q || s.title.toLowerCase().includes(q))
          .map((s) => ({
            id: `session-${s.id}`,
            type: "session" as const,
            label: s.title,
            sublabel: s.messages.length > 1 ? `${s.messages.length - 1} message${s.messages.length > 2 ? "s" : ""}` : "Empty",
            icon: <SessionIcon />,
            onSelect: () => { onSelectSession(s.id); onClose(); },
            active: s.id === activeSessionId,
          }))
      : [];

    const docItems: CommandItem[] = onSelectDocument
      ? documents
          .filter((d) => !q || d.name.toLowerCase().includes(q))
          .map((d) => ({
            id: `doc-${d.id}`,
            type: "document" as const,
            label: d.name.replace(/\.pdf$/i, ""),
            sublabel: "PDF document",
            icon: <DocIcon />,
            onSelect: () => { onSelectDocument(d.id); onClose(); },
          }))
      : [];

    const filteredActions = actions.filter((a) => !q || a.label.toLowerCase().includes(q) || (a.sublabel?.toLowerCase().includes(q) ?? false));

    return [...filteredActions, ...sessionItems, ...docItems, ...navItems];
  }, [query, sessions, documents, activeSessionId, onNewSession, onClose, onSelectSession, onSelectDocument, onUploadDocument, pathname, router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, items.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); items[activeIndex]?.onSelect(); }
    if (e.key === "Escape")    { onClose(); }
  };

  const groupLabel = (type: string) =>
    type === "action" ? "Actions" : type === "session" ? "Sessions" : type === "nav" ? "Go to" : "Documents";
  let lastType = "";

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="glass-card fixed left-1/2 top-[20%] z-50 w-full max-w-xl -translate-x-1/2 rounded-2xl outline-none">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search sessions, documents, or actions and jump to them
          </Dialog.Description>

          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5">
            <span className="text-zinc-600"><SearchIcon /></span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Search sessions, documents, or actions…"
              className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder-zinc-600 outline-none"
            />
            <KbdHint keys={["Esc"]} />
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto p-2 scrollbar-thin">
            {items.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-zinc-600">No results for &quot;{query}&quot;</p>
            ) : (
              items.map((item, index) => {
                const showGroup = item.type !== lastType;
                lastType = item.type;
                return (
                  <div key={item.id}>
                    {showGroup && (
                      <p className="mt-2 px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-700 first:mt-0">
                        {groupLabel(item.type)}
                      </p>
                    )}
                    <button
                      onClick={item.onSelect}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={[
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                        index === activeIndex ? "bg-[var(--surface-3)] text-[var(--text-primary)]" : "text-zinc-400 hover:bg-[var(--surface-2)]",
                      ].join(" ")}
                    >
                      <span className={index === activeIndex ? "text-zinc-300" : "text-zinc-600"}>
                        {item.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">
                          {item.label}
                          {item.active && <span className="ml-2 text-[10px] text-zinc-500">active</span>}
                        </p>
                        {item.sublabel && (
                          <p className="truncate text-[11px] text-zinc-600">{item.sublabel}</p>
                        )}
                      </div>
                      {index === activeIndex && <KbdHint keys={["↵"]} />}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-4 py-2">
            <div className="flex items-center gap-3 text-[11px] text-zinc-700">
              <span className="flex items-center gap-1"><KbdHint keys={["↑","↓"]} /> navigate</span>
              <span className="flex items-center gap-1"><KbdHint keys={["↵"]} /> select</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-zinc-700">
              <KbdHint keys={["⌘","K"]} />
              <span>to open</span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
