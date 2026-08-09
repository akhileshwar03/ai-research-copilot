"use client";

import type { CheckStatus, FormattingCheck } from "@/services/api/paper-analyzer-api";

const STATUS_STYLES: Record<CheckStatus, { label: string; className: string; icon: string }> = {
  pass: { label: "Pass", className: "bg-emerald-500/10 text-emerald-400", icon: "M5 13l4 4L19 7" },
  warning: {
    label: "Warning",
    className: "bg-amber-500/10 text-amber-400",
    icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  },
  fail: { label: "Fail", className: "bg-red-500/10 text-red-400", icon: "M6 18L18 6M6 6l12 12" },
};

export function CheckRow({ check }: { check: FormattingCheck }) {
  const style = STATUS_STYLES[check.status];
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13.5px] font-semibold text-[var(--text-primary)]">{check.label}</p>
        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${style.className}`}>
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={style.icon} />
          </svg>
          {style.label}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11.5px]">
        <div>
          <p className="text-zinc-500">Measured</p>
          <p className="text-zinc-300">{check.measured}</p>
        </div>
        <div>
          <p className="text-zinc-500">Expected</p>
          <p className="text-zinc-300">{check.expected}</p>
        </div>
      </div>
      {check.explanation && <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">{check.explanation}</p>}
    </div>
  );
}
