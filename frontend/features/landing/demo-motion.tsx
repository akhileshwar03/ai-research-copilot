"use client";

import { createContext, useContext, useState } from "react";

import { usePrefersReducedMotion } from "@/features/shared/motion/motion";

/**
 * One switch for every self-playing demo on a page (WCAG 2.2.2 Pause, Stop, Hide: auto-moving content that
 * runs over five seconds beside other content needs a way to stop it, and an OS "reduce motion" setting
 * alone does not satisfy that). The demo widgets read `useDemoPaused()` and stop scheduling their timers;
 * CSS animations inside them are paused through the `data-demo-motion` attribute (see globals.css).
 *
 * Visitors with "reduce motion" set start paused, and can still press Play.
 */
const DemoPausedContext = createContext(false);

export function useDemoPaused(): boolean {
  return useContext(DemoPausedContext);
}

export function DemoMotionProvider({ children }: { children: React.ReactNode }) {
  // null until the visitor presses the button; until then follow the OS "reduce motion" setting.
  const reduced = usePrefersReducedMotion();
  const [choice, setChoice] = useState<boolean | null>(null);
  const paused = choice ?? reduced;

  return (
    <DemoPausedContext.Provider value={paused}>
      <div className="contents" data-demo-motion={paused ? "paused" : "playing"}>
        {children}
      </div>
      <button
        type="button"
        onClick={() => setChoice(!paused)}
        aria-pressed={paused}
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full border border-zinc-300/80 bg-white/85 px-3.5 py-2 text-[12px] font-medium text-zinc-700 shadow-md backdrop-blur transition hover:bg-white hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          {paused ? <path d="M8 5v14l11-7z" /> : <path d="M6 5h4v14H6zM14 5h4v14h-4z" />}
        </svg>
        {paused ? "Play animations" : "Pause animations"}
      </button>
    </DemoPausedContext.Provider>
  );
}
