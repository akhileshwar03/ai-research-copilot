"use client";

import { usePathname } from "next/navigation";

import { ROUTE_TOOL, useAppConfig } from "@/features/shared/hooks/use-app-config";

const TOOL_NAMES: Record<string, string> = {
  research_copilot: "Research Copilot",
  humanizer: "Humanizer",
  checker: "AI Checker",
  realtime: "Real-time AI",
  paper_analyzer: "Paper Analyzer",
  extract: "Text extraction",
};

function InfoIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  );
}

/**
 * Admin-controlled notices, rendered at the top of every product page:
 * the announcement banner, the maintenance notice, and a per-tool
 * "temporarily unavailable" state when that tool's kill switch is off.
 */
export function PlatformNotices() {
  const pathname = usePathname();
  const { config } = useAppConfig();
  const tool = ROUTE_TOOL[pathname];
  const toolDisabled = tool ? config.tools[tool] === false : false;

  if (!config.announcement && !config.maintenance_mode && !toolDisabled) return null;

  return (
    <div className="shrink-0 space-y-px">
      {config.maintenance_mode && (
        <div className="flex items-center gap-2.5 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12.5px] text-[var(--text-primary)]">
          <span className="text-amber-500"><InfoIcon /></span>
          <span>
            <strong className="font-semibold text-amber-500">Maintenance in progress.</strong> Tools are paused for a short while; your
            data is safe and you can keep browsing.
          </span>
        </div>
      )}
      {toolDisabled && !config.maintenance_mode && (
        <div className="flex items-center gap-2.5 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-[12.5px] text-[var(--text-primary)]">
          <span className="text-red-500"><InfoIcon /></span>
          <span>
            <strong className="font-semibold text-red-500">{TOOL_NAMES[tool] ?? "This tool"} is temporarily unavailable.</strong>{" "}
            Requests will be declined until it is switched back on.
          </span>
        </div>
      )}
      {config.announcement && (
        <div
          className="flex items-center gap-2.5 border-b px-4 py-2 text-[12.5px]"
          style={{
            borderColor: "var(--marketing-accent-soft)",
            backgroundColor: "var(--marketing-accent-soft)",
            color: "var(--marketing-accent-text)",
          }}
        >
          <InfoIcon />
          <span>{config.announcement}</span>
        </div>
      )}
    </div>
  );
}
