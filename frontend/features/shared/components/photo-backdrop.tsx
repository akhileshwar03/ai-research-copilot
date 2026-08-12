"use client";

import { usePrefersReducedMotion } from "@/features/shared/motion/motion";

/**
 * A CSS-only stand-in for a soft-focus photograph — blurred masses layered
 * at different blur radii to suggest shallow depth-of-field, rather than one
 * uniform blur. Evolves the same orbit-mass technique already used in
 * features/landing/site-background.tsx.
 *
 * 2026-08-10: recolored from warm desk/wood tones to the "Dawn" palette used
 * by every other tool screen (AtmosphereBackground's PALETTE) — the original
 * warm version was a real, deliberate exception (its own concept doesn't
 * need to match the shader-driven pages), but the user asked directly for
 * every tool to read as one consistent theme, no exceptions, so it's no
 * longer independent. Reconceived as a soft dawn sky/window-light scene
 * (mauve glow low, cooling to deep slate at the edges) rather than a desk
 * surface — it's the same layered-blur technique, just recolored and
 * re-themed to fit the palette's own name instead of forcing an unrelated
 * warm scene to coexist with a cool app.
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
      {/* Base wash: deep slate-blue rising to a soft mauve dawn-glow, darker/
          richer than the app's own Dawn tokens so glass cards read as
          floating above a scene, not sitting flat against the same flat color. */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(160deg, #2a3550 0%, #4a5570 32%, #7d8caa 68%, #d9a8b8 100%)",
        }}
      />

      {/* Near layer — the "dawn glow": warmest note in this cool scene,
          mauve, least blurred, mirroring Dawn's own accent hue. */}
      <div
        className={`absolute -bottom-24 left-[10%] h-[520px] w-[620px] rounded-full ${reduced ? "" : "orbit-a"}`}
        style={{
          background: "radial-gradient(circle, rgba(217,168,184,0.55), transparent 70%)",
          filter: "blur(70px)",
        }}
      />
      {/* Mid layer — softer, cooler, more diffuse. */}
      <div
        className={`absolute -top-16 right-[6%] h-[460px] w-[460px] rounded-full ${reduced ? "" : "orbit-b"}`}
        style={{
          background: "radial-gradient(circle, rgba(125,140,170,0.5), transparent 72%)",
          filter: "blur(95px)",
        }}
      />
      {/* Far layer — recedes into deep slate, coolest and softest. */}
      <div
        className={`absolute left-[35%] top-[35%] h-[420px] w-[420px] rounded-full ${reduced ? "" : "orbit-c"}`}
        style={{
          background: "radial-gradient(circle, rgba(74,85,112,0.4), transparent 75%)",
          filter: "blur(120px)",
        }}
      />

      {/* Vignette closing the frame, like a lens falloff rather than a flat crop. */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 100% at 50% 30%, transparent 45%, rgba(15,17,26,0.4) 100%)" }}
      />
    </div>
  );
}
