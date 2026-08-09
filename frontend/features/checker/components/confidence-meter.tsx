"use client";

import { useEffect, useState } from "react";

/** A horizontal AI-vs-Human split bar, in the spirit of GPTZero's
 *  "AI / Mixed / Human" breakdown but reduced to the two poles our estimate
 *  actually produces. Animates its fill on mount so a result feels like it
 *  resolves rather than snapping in. */
export function ConfidenceMeter({ aiPct, color }: { aiPct: number; color: string }) {
  const [fill, setFill] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setFill(aiPct), 40);
    return () => clearTimeout(id);
  }, [aiPct]);

  const humanPct = 100 - aiPct;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] font-medium tracking-wide">
        <span style={{ color }}>AI {aiPct}%</span>
        <span className="text-zinc-500">Human {humanPct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${fill}%`,
            backgroundColor: color,
            transition: "width 0.9s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>
    </div>
  );
}
