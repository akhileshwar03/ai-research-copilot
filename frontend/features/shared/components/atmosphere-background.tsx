"use client";

import { useEffect, useRef } from "react";
import { MeshGradient } from "@paper-design/shaders-react";

import { usePrefersReducedMotion } from "@/features/shared/motion/motion";
import { useThemeMode } from "@/features/shared/hooks/use-theme-mode";
import { PhotoBackdrop } from "@/features/shared/components/photo-backdrop";

/**
 * Shared page atmosphere: a real GPU-shader animated mesh gradient layered
 * with the engineering-grid texture and film grain used elsewhere in the
 * app, plus a cursor-parallaxed foreground particle field. Fixed, spans the
 * whole scroll.
 *
 * Cinematic direction requires *varying* intensity per screen mood, not one
 * flat treatment everywhere (a uniform "ambient" preset applied to every page
 * is what read as empty/flat last round). Four real moods:
 *   - "vivid": AI Checker's dramatic, asymmetric warm glow radiating from one
 *     corner (not centered) — the boldest hero moment.
 *   - "soft": Sign-in / Humanizer's calm, low-contrast wash.
 *   - "calm": the default utility-chrome level (Chat/shell) — a little more
 *     present than "soft" but still recessive behind dense content.
 *   - "photo": Real-time AI's soft-focus blurred-photograph backdrop
 *     (see PhotoBackdrop) instead of the mesh gradient.
 *
 * Colors branch on the app's light/dark theme (useThemeMode) since a
 * shader's color array is a JS prop, not something a CSS custom property can
 * drive directly.
 */

const PALETTE: Record<"light" | "dark", string[]> = {
  dark: ["#1a0f05", "#e08a3e", "#ff9d4d", "#3d1f6e", "#0a0a0a"],
  // Warm parchment base, the brand copper as the recognizable note, and a
  // warm terracotta-mauve (not a cool violet) standing in for the dark
  // theme's deep violet — a fully saturated cool violet desaturates the
  // mesh's mid-blend zone toward gray, which is part of why the middle of
  // real pages read "flat" last round. Last stop is a warm cream, not pure
  // white — #ffffff here bloomed into a stark, over-bright patch wherever
  // the mesh blended toward it.
  light: ["#fbf3e7", "#f3d9b0", "#e0a058", "#c99b7a", "#fdf6ec"],
};

// grainMixer/grainOverlay stay low — this shader-level grain stacks with the
// .bg-grain CSS overlay painted on top, so both need to stay subtle or the
// combination reads as noisy/CRT-like rather than filmic.
const PRESET = {
  vivid: { distortion: 0.9, swirl: 0.55, speed: 0.4, grainMixer: 0.1, grainOverlay: 0.05, particleCount: 8 },
  calm: { distortion: 0.45, swirl: 0.3, speed: 0.22, grainMixer: 0.06, grainOverlay: 0.03, particleCount: 5 },
  soft: { distortion: 0.22, swirl: 0.15, speed: 0.12, grainMixer: 0.03, grainOverlay: 0.03, particleCount: 3 },
  photo: { distortion: 0, swirl: 0, speed: 0, grainMixer: 0.05, grainOverlay: 0.04, particleCount: 4 },
} as const;

type Variant = keyof typeof PRESET;

const PARTICLE_SLOTS = [
  { top: "10%", left: "18%", size: 3 },
  { top: "22%", left: "82%", size: 4 },
  { top: "34%", left: "8%", size: 3 },
  { top: "48%", left: "60%", size: 5 },
  { top: "58%", left: "30%", size: 3 },
  { top: "70%", left: "88%", size: 4 },
  { top: "80%", left: "15%", size: 3 },
  { top: "90%", left: "50%", size: 4 },
];

export function AtmosphereBackground({ variant = "vivid" }: { variant?: Variant }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number>(0);
  const reduced = usePrefersReducedMotion();
  const theme = useThemeMode();
  const preset = PRESET[variant];
  const vignetteClass = variant === "vivid" ? "atmosphere-vignette-strong" : "atmosphere-vignette";
  const gridClass = variant === "vivid" ? "atmosphere-grid-strong" : "atmosphere-grid";

  useEffect(() => {
    if (reduced) return;
    const el = containerRef.current;
    if (!el) return;

    const handleMove = (e: MouseEvent) => {
      const px = e.clientX / window.innerWidth - 0.5;
      const py = e.clientY / window.innerHeight - 0.5;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        el.style.setProperty("--px", px.toFixed(3));
        el.style.setProperty("--py", py.toFixed(3));
      });
    };

    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      cancelAnimationFrame(frame.current);
    };
  }, [reduced]);

  return (
    <div ref={containerRef} className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0" style={{ backgroundColor: "var(--app-bg)" }} />

      {variant === "photo" ? (
        <PhotoBackdrop />
      ) : (
        <MeshGradient
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0 }}
          colors={PALETTE[theme]}
          distortion={preset.distortion}
          swirl={preset.swirl}
          grainMixer={preset.grainMixer}
          grainOverlay={preset.grainOverlay}
          speed={reduced ? 0 : preset.speed}
        />
      )}

      {/* Dark-mode contrast scrim — the vignette below only darkens the
          edges, so text sitting over the shader's brighter mid-tones (e.g.
          the vivid glow, or a light stretch of the mesh) could lose contrast.
          This flat layer guarantees legibility everywhere, not just at the
          edges. Light theme's text is dark-on-light, so it doesn't need this. */}
      <div className="atmosphere-contrast-scrim absolute inset-0" />

      {/* Vivid's dramatic glow radiates from one corner, not the center — the
          specific "asymmetric" quality the cinematic direction calls for. */}
      {variant === "vivid" && (
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(60% 50% at 88% 8%, var(--accent-glow), transparent 70%)" }}
        />
      )}

      <div className={`site-grid ${gridClass} absolute inset-0 mix-blend-overlay`} />

      {/* Foreground particle field — cursor-parallaxed, reads throughout the scroll. */}
      {PARTICLE_SLOTS.slice(0, preset.particleCount).map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: "var(--marketing-accent)",
            opacity: 0.35,
            transform: `translate3d(calc(var(--px, 0) * ${20 + i * 6}px), calc(var(--py, 0) * ${20 + i * 6}px), 0)`,
          }}
        />
      ))}

      <div className={`${vignetteClass} absolute inset-0`} />

      <div className="bg-grain absolute inset-0" />
    </div>
  );
}
