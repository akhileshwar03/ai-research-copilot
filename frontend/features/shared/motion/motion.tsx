"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Shared motion primitives (marketing page + in-app tools). Both respect
 * prefers-reduced-motion by rendering static content.
 */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** Live-reacts if the OS setting changes mid-session, not just on mount. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/**
 * A soft light source that follows the cursor across the whole viewport —
 * the page-level "flashlight" ambience that makes a dark, glassy layout feel
 * physically lit rather than flat. Fixed, pointer-events: none, sits above
 * the background atmosphere but below real content.
 */
export function CursorSpotlight({ color = "197,105,31" }: { color?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number>(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const handleMove = (e: MouseEvent) => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        ref.current?.style.setProperty("--spot-x", `${e.clientX}px`);
        ref.current?.style.setProperty("--spot-y", `${e.clientY}px`);
      });
    };
    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      cancelAnimationFrame(frame.current);
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed inset-0 z-[1] transition-opacity duration-500"
      style={{
        background: `radial-gradient(600px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(${color},0.06), transparent 70%)`,
      }}
      aria-hidden
    />
  );
}

/** Perspective tilt that follows the cursor — gives the hero card real depth. */
export function Tilt3D({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number>(0);
  const reduced = usePrefersReducedMotion();

  const handleMove = (e: React.MouseEvent) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (!ref.current) return;
      ref.current.style.transform =
        `perspective(1100px) rotateY(${px * 10}deg) rotateX(${py * -10}deg) translateZ(0)`;
    });
  };

  const handleLeave = () => {
    cancelAnimationFrame(frame.current);
    if (ref.current) {
      ref.current.style.transform = "perspective(1100px) rotateY(0deg) rotateX(0deg)";
    }
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={className}
      style={{ transition: "transform 0.35s ease-out", transformStyle: "preserve-3d", willChange: "transform" }}
    >
      {children}
    </div>
  );
}

/**
 * Light-reactive sheen — tracks the cursor over the element and reveals a
 * soft radial highlight at that exact point via CSS custom properties, like
 * light catching glass. Purely visual (pointer-events: none on the overlay)
 * so it never interferes with clicking or typing inside — safe to use on
 * interactive elements, unlike Tilt3D's geometric transform.
 */
export function Glare({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number>(0);
  const reduced = usePrefersReducedMotion();

  const handleMove = (e: React.MouseEvent) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      ref.current?.style.setProperty("--glare-x", `${mx}%`);
      ref.current?.style.setProperty("--glare-y", `${my}%`);
    });
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div ref={ref} onMouseMove={handleMove} className={`glare-surface relative ${className}`} style={style}>
      {children}
      {!reduced && <div className="glare-sheen" aria-hidden />}
    </div>
  );
}

/**
 * Fade-and-rise reveal.
 *
 * Below the fold it waits for the block to scroll into view (IntersectionObserver). Above the fold, pass
 * `above`: the block is then visible from the first paint and the entrance is a pure CSS animation
 * (`.reveal-above`), so JavaScript can never leave the headline invisible and the hero is not held back
 * until hydration. Without JavaScript, blocks that wait for scroll are forced visible by the <noscript>
 * rule in the root layout (they carry `data-reveal`).
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  above = false,
}: { children: React.ReactNode; delay?: number; className?: string; above?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (above) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [above]);

  if (above) {
    return (
      <div className={`reveal-above ${className}`.trim()} style={{ animationDelay: `${delay}ms` }}>
        {children}
      </div>
    );
  }

  const shown = visible || reduced;

  return (
    <div
      ref={ref}
      data-reveal
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
