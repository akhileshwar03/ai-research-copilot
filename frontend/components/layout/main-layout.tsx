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

    <div className="h-screen w-screen overflow-hidden bg-black text-white">

      <PanelGroup direction="horizontal">

        {/* Sidebar */}
        <Panel
          defaultSize={22}
          minSize={18}
          maxSize={30}
        >

          <aside className="h-full border-r border-zinc-800 bg-zinc-950">

            {sidebar}

          </aside>

        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="w-[2px] bg-zinc-800 hover:bg-zinc-600 transition-colors" />

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