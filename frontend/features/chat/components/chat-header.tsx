"use client";

import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";

import { useSessionStore } from "@/stores/session-store";
import type { DocumentItem } from "@/shared/types/api";
import type { Message } from "@/shared/types/chat";

interface ChatHeaderProps {
  sidebarOpen?: boolean;
  documents: DocumentItem[];
  selectedDocumentIds: string[];
  onChangeSelectedDocuments: (documentIds: string[]) => void;
}

// ─── Markdown export helper ───────────────────────────────────────────────────

function messagesToMarkdown(title: string, messages: Message[]): string {
  const lines: string[] = [
    `# ${title}`,
    `_Exported from Querex — ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}_`,
    "",
    "---",
    "",
  ];
  for (const msg of messages) {
    if (
      msg.role === "assistant" &&
      (msg.content === "Welcome to Querex." || msg.content === "Welcome to AI Research Copilot.")
    ) continue;
    lines.push(`**${msg.role === "user" ? "You" : "Querex"}:** ${msg.content}`);
    lines.push("");
  }
  return lines.join("\n");
}

// ─── Export dropdown ──────────────────────────────────────────────────────────

function ExportMenu({ title, messages }: { title: string; messages: Message[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const md = messagesToMarkdown(title, messages);

  const copyMd = async () => {
    try {
      await navigator.clipboard.writeText(md);
      toast.success("Copied as Markdown");
    } catch {
      toast.error("Could not copy to clipboard");
    }
    setOpen(false);
  };

  const downloadMd = () => {
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Export session"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-zinc-600 transition hover:border-[var(--border-medium)] hover:text-zinc-300"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-48 overflow-hidden rounded-xl border border-[var(--border-medium)] bg-[var(--surface-2)] shadow-2xl shadow-black/50">
          <button
            onClick={copyMd}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] text-zinc-300 transition hover:bg-white/[0.05]"
          >
            <svg className="h-3.5 w-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy as Markdown
          </button>
          <div className="mx-3 h-px bg-[var(--border-subtle)]" />
          <button
            onClick={downloadMd}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] text-zinc-300 transition hover:bg-white/[0.05]"
          >
            <svg className="h-3.5 w-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download .md file
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sources picker: which documents this session's chat is scoped to ────────

function SourcesPicker({
  documents,
  selectedDocumentIds,
  onChange,
}: {
  documents: DocumentItem[];
  selectedDocumentIds: string[];
  onChange: (documentIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (documents.length === 0) return null;

  const selectedCount = selectedDocumentIds.length;
  const isScoped = selectedCount > 0;

  const toggle = (id: string) => {
    onChange(
      selectedDocumentIds.includes(id)
        ? selectedDocumentIds.filter((d) => d !== id)
        : [...selectedDocumentIds, id],
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Choose which documents this chat can see"
        className="flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition"
        style={
          isScoped
            ? { borderColor: "var(--marketing-accent-soft)", backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }
            : { borderColor: "var(--border-medium)", color: "var(--text-secondary, #71717a)" }
        }
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {isScoped ? `${selectedCount} source${selectedCount === 1 ? "" : "s"}` : "All documents"}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-[var(--border-medium)] bg-[var(--surface-2)] shadow-2xl shadow-black/50">
          <div className="border-b border-[var(--border-subtle)] px-3.5 py-2.5">
            <p className="text-[12px] font-semibold text-[var(--text-primary)]">Sources for this chat</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Pick specific documents to compare, or leave none selected to search everything.
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto scrollbar-thin py-1">
            {documents.map((doc) => {
              const checked = selectedDocumentIds.includes(doc.id);
              return (
                <button
                  key={doc.id}
                  onClick={() => toggle(doc.id)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition hover:bg-white/[0.05]"
                >
                  <span
                    className={[
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                      checked ? "border-transparent" : "border-white/[0.15] bg-transparent",
                    ].join(" ")}
                    style={checked ? { backgroundColor: "var(--marketing-accent)" } : undefined}
                  >
                    {checked && (
                      <svg className="h-2.5 w-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-zinc-300">
                    {doc.name.replace(/\.pdf$/i, "")}
                  </span>
                </button>
              );
            })}
          </div>
          {isScoped && (
            <div className="border-t border-[var(--border-subtle)] px-3.5 py-2">
              <button
                onClick={() => onChange([])}
                className="text-[11px] text-zinc-500 transition hover:text-zinc-300"
              >
                Clear — search all documents
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatHeader({ sidebarOpen = true, documents, selectedDocumentIds, onChangeSelectedDocuments }: ChatHeaderProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const title = activeSession?.title ?? "Research Session";
  const messages = activeSession?.messages ?? [];

  const toggleSidebar = () =>
    window.dispatchEvent(new CustomEvent("toggle-sidebar"));

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3.5">
      {/* Sidebar toggle */}
      <button
        onClick={toggleSidebar}
        title={sidebarOpen ? "Collapse sidebar (⌘B)" : "Expand sidebar (⌘B)"}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-zinc-600 transition hover:border-[var(--border-medium)] hover:text-zinc-300"
      >
        {sidebarOpen ? (
          /* sidebar is open — show collapse icon (panel with left divider) */
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        ) : (
          /* sidebar is closed — show expand / menu icon */
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{title}</h2>
      </div>

      {/* Export session */}
      {messages.length > 1 && <ExportMenu title={title} messages={messages} />}

      {/* Cmd+K hint */}
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))}
        className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2 py-1 transition hover:border-[var(--border-medium)] sm:flex"
        title="Open command palette"
      >
        <svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-[11px] text-zinc-700">Search</span>
        <div className="flex items-center gap-0.5">
          <kbd className="flex h-4 items-center rounded border border-[var(--border-subtle)] bg-white/[0.03] px-1 text-[9px] font-mono text-zinc-700">⌘</kbd>
          <kbd className="flex h-4 items-center rounded border border-[var(--border-subtle)] bg-white/[0.03] px-1 text-[9px] font-mono text-zinc-700">K</kbd>
        </div>
      </button>

      <SourcesPicker
        documents={documents}
        selectedDocumentIds={selectedDocumentIds}
        onChange={onChangeSelectedDocuments}
      />
    </header>
  );
}
