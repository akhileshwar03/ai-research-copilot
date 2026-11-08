import type { ReactNode } from "react";

/** A small "i" that explains itself on hover, keyboard focus or tap. The text stays in the page (aria-describedby),
 *  so screen readers get it too. */
export function InfoTip({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-current text-[11px] font-bold leading-none text-zinc-400 transition-colors hover:text-[var(--text-primary)] focus-visible:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-lg border border-[var(--border-medium)] bg-[var(--paper-bg)] p-3 text-left text-[12.5px] font-medium leading-relaxed text-[var(--paper-text)] opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}
