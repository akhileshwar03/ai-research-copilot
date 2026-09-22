"use client";

import { buildApiUrl } from "@/constants/config";
import { useAppConfig } from "@/features/shared/hooks/use-app-config";

/**
 * The Querex mark, wherever it's shown as brand identity (not the decorative
 * sparkle reused elsewhere as a generic "AI" motif — chat's empty state,
 * the checker trust-section icon list, etc. — those stay as-is, they aren't
 * standing in for the logo). Renders the admin-uploaded logo (Settings →
 * Appearance → Brand logo) when one is set, falling back to the built-in
 * spark glyph in its accent box otherwise — a single component so every
 * placement (landing nav + footer, legal pages nav, the app's top nav, the
 * login page) updates together the instant an admin uploads or removes one,
 * instead of five separate hand-copied SVGs drifting out of sync.
 */
export function BrandMark({
  boxClassName = "h-8 w-8 rounded-lg shadow-md",
  iconClassName = "h-4 w-4",
}: {
  /** Full box styling (size, radius, shadow/ring, etc.) — each call site
   *  keeps whatever it already had, so swapping in this shared component
   *  doesn't shift any placement's existing look. */
  boxClassName?: string;
  iconClassName?: string;
}) {
  const { config } = useAppConfig();

  if (config.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded, not a static asset Next can optimize
      <img src={buildApiUrl(config.logo_url)} alt="Querex" className={`${boxClassName} shrink-0 object-contain`} />
    );
  }

  return (
    <div
      className={`flex ${boxClassName} shrink-0 items-center justify-center`}
      style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
    >
      <svg className={iconClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
        />
      </svg>
    </div>
  );
}
