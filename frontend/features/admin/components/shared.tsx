"use client";

import { useState, type ReactNode } from "react";

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function formatDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Primitives ───────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const valueColor =
    tone === "good" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : tone === "bad" ? "text-red-400" : "text-[var(--text-primary)]";
  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className = "",
  collapsible = false,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
}: {
  title: string;
  /** Shown in a click-to-open note beside the title — what this section is
   *  and what it's used for. Meant so a newly-appointed admin can understand
   *  every part of this panel without anyone walking them through it. */
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Opt-in — every existing caller keeps today's always-expanded behavior
   *  unless it explicitly asks for this. Used by the Settings tab, where
   *  ~9 categories stacked always-open made the page unnavigable. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Controlled open state, for a caller that needs to drive it (e.g. an
   *  "Expand all" button, or auto-expanding a section with unsaved changes).
   *  Omit both to fall back to internal state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };
  const isOpen = !collapsible || open;
  const [showDescription, setShowDescription] = useState(false);

  return (
    <section className={`glass-card rounded-xl ${className}`}>
      <div
        className={[
          "flex items-center justify-between gap-3 px-4 py-3",
          isOpen ? "border-b border-[var(--border-subtle)]" : "",
          collapsible ? "cursor-pointer select-none" : "",
        ].join(" ")}
        onClick={collapsible ? () => setOpen(!open) : undefined}
        role={collapsible ? "button" : undefined}
        aria-expanded={collapsible ? isOpen : undefined}
      >
        <div className="flex items-center gap-2">
          {collapsible && (
            <svg
              className={`h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform ${isOpen ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
          <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h3>
          {description && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowDescription((v) => !v);
              }}
              aria-expanded={showDescription}
              aria-label={showDescription ? `Hide what ${title} is for` : `What is ${title}?`}
              className={[
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none ring-1 transition-colors",
                showDescription
                  ? "bg-[var(--marketing-accent)] text-white ring-[var(--marketing-accent)]"
                  : "bg-[var(--surface-2)] text-zinc-500 ring-[var(--border-medium)] hover:text-zinc-300",
              ].join(" ")}
            >
              ?
            </button>
          )}
        </div>
        {action}
      </div>
      {description && showDescription && (
        <p className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-[11px] leading-relaxed text-zinc-400">
          {description}
        </p>
      )}
      {isOpen && <div className="p-4">{children}</div>}
    </section>
  );
}

/** A click-to-open "?" badge for a single row/item (as opposed to
 *  SectionCard's own built-in one for a whole section) — e.g. one service in
 *  a list of many, where each needs its own explanation. Caller renders the
 *  expanded text itself (via the returned `open` state) since row layouts
 *  vary too much for this to own that markup. */
export function HelpToggle({
  label,
  open,
  onToggle,
}: {
  /** Used only to build the aria-label ("What is {label}?"). */
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-expanded={open}
      aria-label={open ? `Hide what ${label} is for` : `What is ${label}?`}
      className={[
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none ring-1 transition-colors",
        open
          ? "bg-[var(--marketing-accent)] text-white ring-[var(--marketing-accent)]"
          : "bg-[var(--surface-2)] text-zinc-500 ring-[var(--border-medium)] hover:text-zinc-300",
      ].join(" ")}
    >
      ?
    </button>
  );
}

/** The expanded note HelpToggle reveals — a consistent look wherever it's used. */
export function HelpNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 rounded-md bg-[var(--surface-1)] px-2.5 py-2 text-[11px] leading-relaxed text-zinc-400">
      {children}
    </p>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" }) {
  const cls =
    tone === "good"
      ? "bg-emerald-500/10 text-emerald-400"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-400"
        : tone === "bad"
          ? "bg-red-500/10 text-red-400"
          : tone === "info"
            ? "bg-sky-500/10 text-sky-400"
            : "bg-[var(--surface-3)] text-zinc-400";
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-[10.5px] font-medium ${cls}`}>{children}</span>;
}

export function statusTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "ready") return "good";
  if (status === "processing") return "warn";
  if (status === "failed" || status === "empty") return "bad";
  return "neutral";
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const base = "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const cls =
    variant === "primary"
      ? "text-white hover:opacity-90"
      : variant === "danger"
        ? "border border-red-500/30 text-red-400 hover:bg-red-500/10"
        : variant === "ghost"
          ? "text-zinc-400 hover:text-zinc-200"
          : "border border-[var(--border-subtle)] text-zinc-300 hover-surface";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${cls}`}
      style={variant === "primary" ? { backgroundColor: "var(--marketing-accent)" } : undefined}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  // Two deliberate choices here, both from a real reported bug:
  //
  // 1. Always carries its own border, regardless of checked state — the
  //    off-state fill (--surface-3) sits only a shade away from this
  //    panel's own background in the light "dawn" theme, so without an
  //    explicit outline an "off" toggle was nearly invisible instead of
  //    reading as a control in its off position.
  //
  // 2. The track's color and the knob's position both come from the same
  //    `checked` value, so they can never *end up* disagreeing — but they
  //    used to animate at different visual speeds (the knob's `transform`
  //    is GPU-composited and reads as "arrived" almost instantly; a
  //    `background-color` fade takes the same ~150ms on the clock but
  //    reads as still-in-progress for most of it, since it passes through
  //    perceptibly different intermediate shades). A screenshot taken
  //    mid-update — right after load, or right after a click — caught the
  //    knob already at its new position while the color was still
  //    mid-fade, looking like two different states glued together. Fixed
  //    by not animating color/border at all: only the knob's slide is
  //    animated, so the two can never visually disagree, at any instant.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-5 w-9 shrink-0 rounded-full border disabled:opacity-50"
      style={{
        backgroundColor: checked ? "var(--marketing-accent)" : "var(--surface-3)",
        borderColor: checked ? "var(--marketing-accent)" : "var(--border-strong)",
      }}
    >
      <span
        className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full border shadow transition-transform"
        style={{
          // left-0.5 pins the un-transformed base at a fixed 2px — without
          // an explicit left, the browser was resolving the knob's static
          // position based on the button's own layout (landing well right
          // of the actual edge), so this translateX was stacking on top of
          // an unpredictable starting point instead of a known one. That's
          // what let the checked-state knob slide most of its own width
          // past the track's right edge.
          transform: checked ? "translateX(14px)" : "translateX(0)",
          backgroundColor: "#ffffff",
          borderColor: checked ? "transparent" : "var(--border-strong)",
        }}
      />
    </button>
  );
}

export function Pager({ skip, limit, total, onChange }: { skip: number; limit: number; total: number; onChange: (skip: number) => void }) {
  if (total <= limit) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-[12px] text-zinc-500">
      <Button disabled={skip === 0} onClick={() => onChange(Math.max(0, skip - limit))}>Previous</Button>
      <span className="tabular-nums">
        {skip + 1}–{Math.min(skip + limit, total)} of {total}
      </span>
      <Button disabled={skip + limit >= total} onClick={() => onChange(skip + limit)}>Next</Button>
    </div>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="glass-card overflow-x-auto rounded-xl">
      <table className="w-full text-left text-[13px]">{children}</table>
    </div>
  );
}

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2.5 ${right ? "text-right" : ""}`}>{children}</th>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-zinc-500">
        {children}
      </td>
    </tr>
  );
}

export const THEAD_CLASS = "border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] uppercase tracking-wide text-zinc-500";
export const ROW_CLASS = "border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-2)]";
export const INPUT_CLASS = "rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus-accent";

// ─── Charts (inline SVG, no dependency) ───────────────────────────────────────

export function BarChart({
  data,
  color = "var(--marketing-accent)",
  height = 120,
  labelEvery,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  labelEvery?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  const width = 600;
  const gap = 2;
  const barW = (width - gap * (n - 1)) / n;
  const every = labelEvery ?? Math.max(1, Math.ceil(n / 8));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height + 18}`} className="h-auto w-full" role="img" aria-label="bar chart">
        {data.map((d, i) => {
          const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * height);
          const x = i * (barW + gap);
          return (
            <g key={d.label}>
              <rect x={x} y={height - h} width={barW} height={h} rx={1.5} fill={color} opacity={0.85}>
                <title>{`${d.label}: ${d.value}`}</title>
              </rect>
              {i % every === 0 && (
                <text x={x + barW / 2} y={height + 13} textAnchor="middle" fontSize={9} fill="currentColor" className="text-zinc-500">
                  {formatDay(d.label)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] text-zinc-600">
        Total {total.toLocaleString()} · peak {max.toLocaleString()}/day
      </p>
    </div>
  );
}

export function HBar({ value, max, color = "var(--marketing-accent)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-[var(--surface-3)]">
      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}
