"use client";

import type { ReactNode } from "react";

import { buildApiUrl } from "@/constants/config";
import { type BackgroundPage, useAppConfig } from "@/features/shared/hooks/use-app-config";

/**
 * Switches a page between its built-in animated background and an
 * admin-uploaded static image, driven by the public /app/config
 * `backgrounds[page]` entry (see runtime_settings.BACKGROUND_PAGES on the
 * backend). Every page keeps rendering its own `dynamic` node unchanged —
 * this only decides which one is mounted, so the six existing background
 * components (SiteBackground, AtmosphereBackground variants) don't need to
 * know anything about this feature.
 */
export function PageBackground({ page, dynamic }: { page: BackgroundPage; dynamic: ReactNode }) {
  const { config } = useAppConfig();
  const bg = config.backgrounds[page];

  if (bg.mode === "static" && bg.image_url) {
    // 2026-09-20: real, reported issue — a raw uploaded photo behind page
    // content has none of the legibility treatment the dynamic backgrounds
    // built in from the start (SiteBackground's own gradient wash, every
    // AtmosphereBackground variant's vignette + contrast scrim). An
    // arbitrary admin-uploaded image can be busy or high-contrast in
    // exactly the spot text sits, so it needs the same kind of treatment,
    // not none at all. Two layers: a slight blur+desaturate on the image
    // itself (softens fine detail competing with text without hiding the
    // image), and a translucent wash on top tuned per surface — landing is
    // always light-themed (same reasoning/colors as SiteBackground's own
    // hardcoded wash, which can't safely read the mutable app tokens
    // either), the 5 tool pages use the live theme's own --app-bg so the
    // wash is automatically dark-on-dark-theme / light-on-light-theme.
    const overlay =
      page === "landing"
        ? "linear-gradient(180deg, rgba(253,248,240,0.61) 0%, rgba(247,239,226,0.4) 42%, rgba(239,225,204,0.61) 100%)"
        : undefined;
    return (
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${buildApiUrl(bg.image_url)})`, filter: "blur(1.25px) saturate(0.88)" }}
        />
        {overlay ? (
          <div className="absolute inset-0" style={{ background: overlay }} />
        ) : (
          <div className="absolute inset-0 opacity-45" style={{ backgroundColor: "var(--app-bg)" }} />
        )}
        <div className="atmosphere-vignette-strong absolute inset-0" />
      </div>
    );
  }

  // Also the safe fallback for mode==="static" with no image_url yet — can't
  // actually happen once saved (the admin flow requires an image before the
  // mode change is allowed to save), but stay correct if a request ever
  // observes a mid-flight state.
  return <>{dynamic}</>;
}
