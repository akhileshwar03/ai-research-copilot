"use client";

import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";

export default function MainLayout({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;

  children: React.ReactNode;
}) {

  return (

    <div className="h-screen w-screen overflow-hidden bg-[#080808] text-white">

      <PanelGroup direction="horizontal">

        {/* Sidebar */}
        <Panel
          defaultSize={22}
          minSize={18}
          maxSize={30}
        >

          <aside className="h-full border-r border-white/[0.05]">

            {sidebar}

          </aside>

        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="w-px bg-white/[0.05] hover:bg-white/[0.15] transition-colors cursor-col-resize" />

        {/* Main */}
        <Panel defaultSize={78}>

          <main className="h-full overflow-hidden">

            {children}

          </main>

        </Panel>

      </PanelGroup>

    </div>

  );
}