"use client";

import { AtmosphereBackground } from "@/features/shared/components/atmosphere-background";

/**
 * The Checker page's atmosphere. Thin wrapper around the shared
 * AtmosphereBackground — this page originated the pattern (real GPU-shader
 * mesh gradient + grid + cursor-parallaxed particles + vignette + grain),
 * which has since been generalized for reuse across Login, Chat, Humanizer,
 * and Real-time AI. Kept as its own file/name so the Checker page's imports
 * don't need to change.
 */
export function CheckerBackground() {
  return <AtmosphereBackground variant="vivid" />;
}
