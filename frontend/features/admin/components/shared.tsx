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
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
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

// ─── Status and Badges ────────────────────────────────────────────────────────

export type StatusTone = "neutral" | "good" | "warn" | "bad" | "info";

export function statusTone(status: string): StatusTone {
  const s = status.toLowerCase();
  if (s === "ready" || s === "active" || s === "up" || s === "ok" || s === "enabled") return "good";
  if (s === "processing" || s === "paused" || s === "unverified" || s === "warn") return "warn";
  if (s === "failed" || s === "empty" || s === "suspended" || s === "bad" || s === "down" || s === "unreachable") return "bad";
  if (s === "admin" || s === "production") return "info";
  return "neutral";
}

export function StatusDot({ tone = "neutral", ping = false }: { tone?: StatusTone; ping?: boolean }) {
  const dotColor =
    tone === "good"
      ? "bg-emerald-400"
      : tone === "warn"
        ? "bg-amber-400"
        : tone === "bad"
          ? "bg-rose-400"
          : tone === "info"
            ? "bg-sky-400"
            : "bg-zinc-400";

  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {ping && (tone === "good" || tone === "warn" || tone === "bad") && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dotColor}`} />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: StatusTone;
  dot?: boolean;
}) {
  const toneClasses =
    tone === "good"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
        : tone === "bad"
          ? "bg-rose-500/10 text-rose-400 border-rose-500/25"
          : tone === "info"
            ? "bg-sky-500/10 text-sky-400 border-sky-500/25"
            : "bg-[var(--surface-3)] text-zinc-400 border-[var(--border-subtle)]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-none tracking-tight ${toneClasses}`}
    >
      {dot && <StatusDot tone={tone} />}
      {children}
    </span>
  );
}

// ─── Cards & Containers ───────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: StatusTone;
  icon?: ReactNode;
}) {
  const valueColor =
    tone === "good"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : tone === "bad"
          ? "text-rose-400"
          : tone === "info"
            ? "text-sky-400"
            : "text-[var(--text-primary)]";

  const accentBorder =
    tone === "good"
      ? "border-emerald-500/20"
      : tone === "warn"
        ? "border-amber-500/20"
        : tone === "bad"
          ? "border-rose-500/20"
          : "border-[var(--border-subtle)]";

  return (
    <div
      className={`glass-card relative flex flex-col justify-between overflow-hidden rounded-xl border p-3.5 transition-all duration-150 hover:border-[var(--border-strong)] sm:p-4 ${accentBorder}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </p>
        {icon && <div className="text-zinc-500">{icon}</div>}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <p className={`font-data text-2xl font-bold tracking-tight tabular-nums sm:text-[26px] ${valueColor}`}>
          {value}
        </p>
      </div>
      {hint ? (
        <p className="mt-1.5 truncate text-[11.5px] font-medium text-zinc-400" title={hint}>
          {hint}
        </p>
      ) : (
        <div className="mt-1.5 h-[17px]" />
      )}
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
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  icon?: ReactNode;
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
    <section className={`glass-card overflow-hidden rounded-xl border border-[var(--border-subtle)] shadow-xs ${className}`}>
      <div
        className={[
          "flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 sm:px-5 sm:py-3.5",
          isOpen ? "border-b border-[var(--border-subtle)] bg-[var(--surface-1)]/40" : "",
          collapsible ? "cursor-pointer select-none transition-colors hover:bg-[var(--surface-2)]/60" : "",
        ].join(" ")}
        onClick={collapsible ? () => setOpen(!open) : undefined}
        role={collapsible ? "button" : undefined}
        aria-expanded={collapsible ? isOpen : undefined}
      >
        <div className="flex items-center gap-2.5">
          {collapsible && (
            <svg
              className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-200 ${isOpen ? "rotate-90 text-[var(--marketing-accent-text)]" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
          {icon && <span className="text-zinc-400">{icon}</span>}
          <h3 className="text-[13.5px] font-bold tracking-tight text-[var(--text-primary)]">{title}</h3>
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
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none ring-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marketing-accent)]",
                showDescription
                  ? "bg-[var(--marketing-accent)] text-white ring-[var(--marketing-accent)] shadow-xs"
                  : "bg-[var(--surface-2)] text-zinc-400 ring-[var(--border-medium)] hover:text-zinc-200 hover:ring-[var(--border-strong)]",
              ].join(" ")}
            >
              ?
            </button>
          )}
        </div>
        {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
      </div>
      {description && showDescription && (
        <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-2)]/80 px-4 py-3 sm:px-5">
          <p className="text-[12px] leading-relaxed text-zinc-300">{description}</p>
        </div>
      )}
      {isOpen && <div className="p-4 sm:p-5">{children}</div>}
    </section>
  );
}

export function HelpToggle({
  label,
  open,
  onToggle,
}: {
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
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none ring-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marketing-accent)]",
        open
          ? "bg-[var(--marketing-accent)] text-white ring-[var(--marketing-accent)] shadow-xs"
          : "bg-[var(--surface-2)] text-zinc-400 ring-[var(--border-medium)] hover:text-zinc-200 hover:ring-[var(--border-strong)]",
      ].join(" ")}
    >
      ?
    </button>
  );
}

export function HelpNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/90 px-3.5 py-2.5 text-[12px] leading-relaxed text-zinc-300 shadow-xs">
      {children}
    </div>
  );
}

// ─── Form Controls ────────────────────────────────────────────────────────────

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  title,
  type = "button",
  size = "md",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
  size?: "sm" | "md";
}) {
  const sizeClasses = size === "sm" ? "px-2.5 py-1 text-[11.5px]" : "px-3 py-1.5 text-[12.5px]";
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all duration-150 select-none disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marketing-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--app-bg)] active:scale-[0.98]";

  let cls = "";
  let style: React.CSSProperties | undefined;

  if (variant === "primary") {
    cls = "text-white shadow-xs hover:brightness-110 active:brightness-95";
    style = { backgroundColor: "var(--marketing-accent)" };
  } else if (variant === "danger") {
    cls =
      "border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/40 active:bg-rose-500/30";
  } else if (variant === "ghost") {
    cls = "text-zinc-400 hover:bg-[var(--surface-2)] hover:text-zinc-200 active:bg-[var(--surface-3)]";
  } else {
    cls =
      "border border-[var(--border-subtle)] bg-[var(--surface-1)] text-zinc-300 hover:bg-[var(--surface-2)] hover:border-[var(--border-medium)] hover:text-white";
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${sizeClasses} ${cls}`}
      style={style}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-5 w-9 shrink-0 rounded-full border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marketing-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--app-bg)] disabled:opacity-40"
      style={{
        backgroundColor: checked ? "var(--marketing-accent)" : "var(--surface-3)",
        borderColor: checked ? "var(--marketing-accent)" : "var(--border-strong)",
      }}
    >
      <span
        className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full border shadow-xs transition-transform duration-150"
        style={{
          transform: checked ? "translateX(14px)" : "translateX(0)",
          backgroundColor: "#ffffff",
          borderColor: checked ? "transparent" : "var(--border-strong)",
        }}
      />
    </button>
  );
}

export function Pager({
  skip,
  limit,
  total,
  onChange,
}: {
  skip: number;
  limit: number;
  total: number;
  onChange: (skip: number) => void;
}) {
  if (total <= limit) return null;
  const start = skip + 1;
  const end = Math.min(skip + limit, total);
  return (
    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 text-[12px] text-zinc-400">
      <span className="font-data font-medium text-zinc-500">
        Showing <span className="text-zinc-300">{start}–{end}</span> of <span className="text-zinc-300">{total}</span>
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          disabled={skip === 0}
          onClick={() => onChange(Math.max(0, skip - limit))}
          title="Previous page"
        >
          ← Prev
        </Button>
        <span className="px-2 font-data text-xs text-zinc-400">
          Page {Math.floor(skip / limit) + 1} of {Math.ceil(total / limit)}
        </span>
        <Button
          size="sm"
          disabled={skip + limit >= total}
          onClick={() => onChange(skip + limit)}
          title="Next page"
        >
          Next →
        </Button>
      </div>
    </div>
  );
}

// ─── Tables ───────────────────────────────────────────────────────────────────

export function TableShell({
  children,
  className = "",
  maxHeight = "calc(100vh - 280px)",
}: {
  children: ReactNode;
  className?: string;
  maxHeight?: string;
}) {
  return (
    <div
      className={`glass-card scrollbar-thin relative overflow-x-auto rounded-xl border border-[var(--border-subtle)] shadow-xs ${className}`}
      style={{ maxHeight }}
    >
      <table className="w-full text-left text-[12.5px] border-collapse">{children}</table>
    </div>
  );
}

export function Th({
  children,
  right,
  className = "",
}: {
  children?: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <th
      className={`sticky top-0 z-10 bg-[var(--surface-1)]/95 px-3.5 py-3 text-[11px] font-bold uppercase tracking-wider text-zinc-400 backdrop-blur-md border-b border-[var(--border-subtle)] ${
        right ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function EmptyRow({
  colSpan,
  children,
  icon,
}: {
  colSpan: number;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-zinc-400">
        <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-2">
          {icon ?? (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-2)] text-zinc-500 ring-1 ring-[var(--border-subtle)]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
          )}
          <p className="text-[13px] font-medium text-zinc-300">{children}</p>
        </div>
      </td>
    </tr>
  );
}

export function TableSkeletonRows({ colSpan, rows = 6 }: { colSpan: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-[var(--border-subtle)] animate-pulse">
          <td colSpan={colSpan} className="px-3.5 py-3.5">
            <div className="flex items-center gap-3">
              <div className="h-3.5 w-1/4 rounded bg-[var(--surface-3)]" />
              <div className="h-3.5 w-1/3 rounded bg-[var(--surface-2)]" />
              <div className="h-3.5 w-1/6 rounded bg-[var(--surface-3)]" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

export const THEAD_CLASS = "";
export const ROW_CLASS =
  "border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--surface-2)]/70 last:border-b-0";
export const INPUT_CLASS =
  "rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-[12.5px] text-zinc-200 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marketing-accent)] focus-visible:border-transparent transition-all";

// ─── Charts (inline SVG, responsive, no external dependency) ─────────────────

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
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  const width = 600;
  const gap = 3;
  const barW = Math.max(2, (width - gap * (n - 1)) / n);
  const every = labelEvery ?? Math.max(1, Math.ceil(n / 7));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-400">
        <span className="font-data font-medium">
          Total: <span className="font-bold text-zinc-200">{total.toLocaleString()}</span>
        </span>
        <span className="font-data font-medium">
          Peak: <span className="font-bold text-zinc-200">{max.toLocaleString()}</span>/day
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height + 22}`}
          className="h-auto w-full select-none"
          role="img"
          aria-label="bar chart"
        >
          {/* Subtle horizontal grid lines */}
          <line x1="0" y1="0" x2={width} y2="0" stroke="var(--border-subtle)" strokeDasharray="3 3" />
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--border-subtle)" strokeDasharray="3 3" />
          <line x1="0" y1={height} x2={width} y2={height} stroke="var(--border-medium)" />

          {data.map((d, i) => {
            const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * height);
            const x = i * (barW + gap);
            const isHovered = hoveredIdx === i;
            return (
              <g
                key={d.label}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                <rect
                  x={x}
                  y={height - h}
                  width={barW}
                  height={h}
                  rx={2}
                  fill={color}
                  opacity={isHovered ? 1 : 0.8}
                  className="transition-opacity duration-100"
                >
                  <title>{`${d.label}: ${d.value.toLocaleString()}`}</title>
                </rect>
                {i % every === 0 && (
                  <text
                    x={x + barW / 2}
                    y={height + 15}
                    textAnchor="middle"
                    fontSize={10}
                    fill="currentColor"
                    className="font-data text-zinc-500 select-none"
                  >
                    {formatDay(d.label)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hoveredIdx !== null && data[hoveredIdx] && (
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-md border border-[var(--border-medium)] bg-[var(--surface-2)]/95 px-2.5 py-1 text-center shadow-lg backdrop-blur-md">
            <span className="text-[11px] font-bold text-zinc-200">
              {formatDay(data[hoveredIdx].label)}: {data[hoveredIdx].value.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function HBar({
  value,
  max,
  color = "var(--marketing-accent)",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(2, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function DeltaBadge({
  change,
  amount,
  suffix,
  higherIsBetter = true,
  className = "",
}: {
  change: number;
  amount: string;
  suffix: string;
  higherIsBetter?: boolean;
  className?: string;
}) {
  const flat = change === 0;
  const up = change > 0;
  const tone = flat ? "text-zinc-600" : up === higherIsBetter ? "text-emerald-700" : "text-red-700";
  const arrow = flat ? "▬" : up ? "▲" : "▼";
  const sign = flat ? "" : up ? "+" : "-";
  return (
    <p className={`mt-1 font-data text-[11px] font-bold ${tone} ${className}`}>
      {arrow} {sign}
      {amount} {suffix}
    </p>
  );
}
