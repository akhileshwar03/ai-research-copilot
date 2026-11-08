"use client";

import { useEffect, useState } from "react";

/** Shows that work is in progress and has not stalled: a moving bar and a running second count. After a while it
 *  says plainly that the wait is longer than usual. Mount it only while the work runs, so the count starts at 0. */
export function ProgressNote({ label, hint }: { label: string; hint?: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const note =
    seconds >= 30
      ? "This is taking longer than usual. You can keep waiting."
      : seconds >= 8
        ? "Still working. Longer documents take more time."
        : hint;

  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-semibold text-[var(--text-primary)]">{label}</p>
        <span className="font-data text-[12.5px] text-zinc-400" aria-hidden>
          {seconds}s
        </span>
      </div>
      <div className="indeterminate h-2 w-full rounded-full" aria-hidden />
      {note && <p className="text-[12.5px] leading-relaxed text-zinc-400">{note}</p>}
    </div>
  );
}
