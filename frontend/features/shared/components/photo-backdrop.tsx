"use client";

import { usePrefersReducedMotion } from "@/features/shared/motion/motion";

/**
 * A CSS-only stand-in for a soft-focus photograph — warm desk/wood-toned
 * blurred masses layered at different blur radii to suggest shallow
 * depth-of-field (sharper/warmer low-center where a "desk surface" would be,
 * softer/cooler toward the edges where a "room" would recede), rather than
 * one uniform blur. Evolves the same orbit-mass technique already used in
 * features/landing/site-background.tsx, just with a photographic color
 * script instead of the brand-copper-only palette.
 *
 * This is a deliberate placeholder, not a sourced photo: real photography
 * would need licensing/attribution this product doesn't have in place. If a
 * real photo is added later, it plugs in here — AtmosphereBackground's
 * "photo" variant only knows about this component's outer shape (a fixed,
 * full-bleed layer), not its internals, so swapping is contained to this file.
 */
export function PhotoBackdrop() {
  const reduced = usePrefersReducedMotion();

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base wash: warm desk-toned gradient, darker/richer than the app's
          own parchment tokens so glass cards read as floating above a scene. */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(160deg, #d8c3a0 0%, #c9ab7e 32%, #8a6f52 68%, #5c4a38 100%)",
        }}
      />

      {/* Near layer — "desk surface": warmest, most saturated, least blurred. */}
      <div
        className={`absolute -bottom-24 left-[10%] h-[520px] w-[620px] rounded-full ${reduced ? "" : "orbit-a"}`}
        style={{
          background: "radial-gradient(circle, rgba(201,171,126,0.55), transparent 70%)",
          filter: "blur(70px)",
        }}
      />
      {/* Mid layer — softer, cooler, more diffuse. */}
      <div
        className={`absolute -top-16 right-[6%] h-[460px] w-[460px] rounded-full ${reduced ? "" : "orbit-b"}`}
        style={{
          background: "radial-gradient(circle, rgba(138,111,82,0.5), transparent 72%)",
          filter: "blur(95px)",
        }}
      />
      {/* Far layer — the "recedes into the room" note, coolest and softest. */}
      <div
        className={`absolute left-[35%] top-[35%] h-[420px] w-[420px] rounded-full ${reduced ? "" : "orbit-c"}`}
        style={{
          background: "radial-gradient(circle, rgba(92,74,56,0.4), transparent 75%)",
          filter: "blur(120px)",
        }}
      />

      {/* Vignette closing the frame, like a lens falloff rather than a flat crop. */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 100% at 50% 30%, transparent 45%, rgba(40,30,20,0.35) 100%)" }}
      />
    </div>
  );
}
