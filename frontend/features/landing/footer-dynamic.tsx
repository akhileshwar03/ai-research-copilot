"use client";

import { ROUTE_TOOL, useAppConfig } from "@/features/shared/hooks/use-app-config";

/** The footer bits that depend on live config (Settings → Feature switches /
 *  Legal & contact) — kept as small client components so the landing page
 *  itself can stay a server component, same pattern as GithubNavLink. */

export function SupportEmailLink({ className }: { className: string }) {
  const { config } = useAppConfig();
  if (!config.support_email) return null;
  return (
    <a href={`mailto:${config.support_email}`} className={className}>
      Contact
    </a>
  );
}

export function FooterCopyright() {
  const { config } = useAppConfig();
  return (
    <span>
      © {new Date().getFullYear()} {config.legal_entity_name}. All rights reserved.
    </span>
  );
}

/** Real per-tool status, driven by the same tool_*_enabled switches Settings
 *  → Feature switches controls — was hardcoded "Live" for all 5, so turning
 *  a tool off in admin had no visible effect here. */
export function FooterStatusList({ products }: { products: { name: string; href: string }[] }) {
  const { config } = useAppConfig();
  return (
    <ul className="mt-4 space-y-2.5">
      {products.map((product) => {
        const toolKey = ROUTE_TOOL[product.href];
        const enabled = toolKey ? config.tools[toolKey] : true;
        return (
          <li key={product.name} className="flex items-center gap-2 text-[13.5px] text-zinc-600">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${enabled ? "bg-emerald-500" : "bg-zinc-300"}`} />
            <span className="truncate">{product.name}</span>
            <span className="ml-auto shrink-0 text-[11px] text-zinc-400">{enabled ? "Live" : "Paused"}</span>
          </li>
        );
      })}
    </ul>
  );
}
