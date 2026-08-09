"use client";

import { useEffect, useState } from "react";

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ProbabilityGauge({
  targetPct,
  color,
  label = "AI probability",
}: {
  targetPct: number;
  color: string;
  label?: string;
}) {
  // Render at 0 first, then flip to the real value on the next tick so the
  // CSS transition below animates instead of snapping straight to it.
  //
  // Deliberately NOT requestAnimationFrame-driven: rAF can be throttled or
  // never fire at all for a backgrounded/inactive tab, which left this stuck
  // showing 0% forever even though the correct value had already arrived —
  // a real bug, confirmed via the component's own state staying at 0 while
  // its `targetPct` prop was correctly 3. setTimeout always eventually
  // fires regardless of tab visibility, and the actual sweep animation is
  // handled by the CSS `transition` below, not a JS loop — so this can't
  // get stuck the same way.
  const [displayPct, setDisplayPct] = useState(0);

  useEffect(() => {
    setDisplayPct(0);
    const id = setTimeout(() => setDisplayPct(targetPct), 30);
    return () => clearTimeout(id);
  }, [targetPct]);

  const offset = CIRCUMFERENCE * (1 - displayPct / 100);

  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--border-subtle)" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.3s" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-data text-2xl font-semibold text-[var(--text-primary)]">{displayPct}%</span>
        <span className="text-[10px] text-zinc-500">{label}</span>
      </div>
    </div>
  );
}
