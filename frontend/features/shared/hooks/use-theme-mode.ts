"use client";

import { useEffect, useState } from "react";

function readMode(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light-theme") ? "light" : "dark";
}

/**
 * Tracks the app's light/dark theme (the `html.light-theme` class toggled by
 * the profile settings modal). There's no change event for that toggle, so
 * this observes the class attribute directly — needed by anything that picks
 * colors in JS rather than CSS (e.g. a shader's color array prop), since a
 * WebGL component can't read a CSS custom property.
 *
 * Lazy-initializes from the DOM so the correct palette is picked before the
 * first paint instead of flashing dark-then-light on mount.
 */
export function useThemeMode(): "light" | "dark" {
  const [mode, setMode] = useState<"light" | "dark">(readMode);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setMode(readMode());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return mode;
}
