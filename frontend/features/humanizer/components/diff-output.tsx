"use client";

import { diffWords } from "diff";

/**
 * Renders the humanized text with the words/phrases that actually changed
 * from the original highlighted — proves the rewrite did real work instead
 * of just presenting a wall of new text to take on faith.
 */
export function DiffOutput({ original, humanized }: { original: string; humanized: string }) {
  const parts = diffWords(original, humanized);

  return (
    <>
      {parts
        .filter((part) => !part.removed)
        .map((part, i) =>
          part.added ? (
            <mark
              key={i}
              className="rounded px-0.5"
              style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
            >
              {part.value}
            </mark>
          ) : (
            <span key={i}>{part.value}</span>
          ),
        )}
    </>
  );
}
