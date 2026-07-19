"use client";

import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/features/landing/motion";

/**
 * The marketing page's persistent atmosphere: a fixed, full-viewport 3D scene
 * that stays visible as the page scrolls (rather than a hero-only effect that
 * ends abruptly). Composed of:
 *   - a warm multi-stop gradient wash + vignette
 *   - a perspective "floor" plane anchored near the top (the hero horizon)
 *   - a flat, continuous engineering-grid texture for the rest of the scroll
 *   - three independently-orbiting blurred color masses at different depths
 *   - a foreground particle field, all parallaxed by cursor position
 *
 * Everything is driven by CSS custom properties written via rAF — no
 * per-frame React re-renders — and collapses to a static scene under
 * prefers-reduced-motion.
 */
export function SiteBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number>(0);
  const reduced = usePrefersReducedMotion();

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
      {/* Base wash: warm gradient with subtle top-to-bottom depth */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #fbf9f6 0%, #faf8f4 38%, #f7f4ee 100%)",
        }}
      />

      {/* Continuous flat engineering-grid texture — visible the whole scroll */}
      <div className="site-grid absolute inset-0" />

      {/* Orbiting color masses — three depths, organic (not simple up/down) motion.
          Parallax (JS, inline transform) and orbit drift (CSS animation) are
          split across nested elements — both target `transform`, and a CSS
          animation silently wins over an inline style on the same node. */}
      <div
        className="absolute left-[6%] top-[4%]"
        style={{ transform: "translate3d(calc(var(--px, 0) * -16px), calc(var(--py, 0) * -16px), 0)" }}
      >
        <div className="orbit-a h-[520px] w-[520px] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(224,138,62,0.18), transparent 70%)" }} />
      </div>
      <div
        className="absolute right-[4%] top-[22%]"
        style={{ transform: "translate3d(calc(var(--px, 0) * -11px), calc(var(--py, 0) * -11px), 0)" }}
      >
        <div className="orbit-b h-[420px] w-[420px] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(120,113,108,0.12), transparent 70%)" }} />
      </div>
      <div
        className="absolute left-[20%] top-[62%]"
        style={{ transform: "translate3d(calc(var(--px, 0) * -8px), calc(var(--py, 0) * -8px), 0)" }}
      >
        <div className="orbit-c h-[460px] w-[460px] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(224,138,62,0.14), transparent 72%)" }} />
      </div>

      {/* Foreground particle field — fixed, so it reads throughout the scroll */}
      {[
        { top: "12%", left: "42%", size: 7 },
        { top: "31%", left: "12%", size: 5 },
        { top: "28%", left: "68%", size: 4 },
        { top: "48%", left: "85%", size: 6 },
        { top: "58%", left: "35%", size: 5 },
        { top: "72%", left: "58%", size: 4 },
        { top: "84%", left: "22%", size: 6 },
        { top: "90%", left: "78%", size: 5 },
      ].map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: "var(--marketing-accent)",
            opacity: 0.3,
            transform: `translate3d(calc(var(--px, 0) * ${24 + i * 5}px), calc(var(--py, 0) * ${24 + i * 5}px), 0)`,
          }}
        />
      ))}

      {/* Vignette — subtle focus toward center */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 15%, transparent 55%, rgba(30,24,18,0.05) 100%)",
        }}
      />

      {/* Film grain, on top of everything for texture cohesion */}
      <div className="bg-grain absolute inset-0" />
    </div>
  );
}
