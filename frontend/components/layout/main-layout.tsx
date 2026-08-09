"use client";

import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";

import { AtmosphereBackground } from "@/features/shared/components/atmosphere-background";

interface MainLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  /** When true the sidebar panel is hidden and the main area fills the screen */
  sidebarCollapsed?: boolean;
  /** Defaults to the "calm" mood atmosphere; pass a product's own background (e.g. CheckerBackground) to override. */
  background?: React.ReactNode;
}

export default function MainLayout({
  sidebar,
  children,
  sidebarCollapsed = false,
  background,
}: MainLayoutProps) {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--app-bg)] text-white">
      {background ?? <AtmosphereBackground variant="calm" />}

      <div className="relative z-10 h-full w-full">
      {sidebarCollapsed ? (
        /* Collapsed: full-width main area, no panel overhead */
        <main className="h-full overflow-hidden">{children}</main>
      ) : (
        <PanelGroup direction="horizontal" autoSaveId="workspace-layout">
          {/* Sidebar */}
          <Panel defaultSize={22} minSize={16} maxSize={32}>
            <aside className="h-full border-r border-[var(--border-subtle)]">
              {sidebar}
            </aside>
          </Panel>

          {/* Resize handle */}
          <PanelResizeHandle
            className="w-px transition-colors cursor-col-resize"
            style={{ backgroundColor: "var(--resize-handle)" }}
            onDragging={(d) => {
              const el = document.querySelector("[data-resize-handle]") as HTMLElement | null;
              if (el) el.style.backgroundColor = d ? "var(--resize-handle-hover)" : "var(--resize-handle)";
            }}
          />

          {/* Main */}
          <Panel defaultSize={78}>
            <main className="h-full overflow-hidden">{children}</main>
          </Panel>
        </PanelGroup>
      )}
      </div>
    </div>
  );
}
