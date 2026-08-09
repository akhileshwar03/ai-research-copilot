"use client";

import { Glare } from "@/features/shared/motion/motion";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { WorkspaceProfileFooter } from "@/components/layout/workspace-profile-footer";

/**
 * Shared sidebar for products with no session/document persistence
 * (Checker, Humanizer are stateless single-shot tools) — just the
 * product-switcher nav and account access, no contextual list.
 */
export function ProductShellSidebar() {
  return (
    <Glare className="glass-panel flex h-full flex-col overflow-hidden">
      <WorkspaceNav />
      <div className="flex-1" />
      <WorkspaceProfileFooter />
    </Glare>
  );
}
