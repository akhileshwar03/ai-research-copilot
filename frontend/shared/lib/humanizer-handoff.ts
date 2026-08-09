const KEY = "querex:humanizer-prefill";

/** Stash checked text so Humanizer can pick it up after navigation. */
export function setHumanizerPrefill(text: string): void {
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    /* sessionStorage unavailable (e.g. private mode) — handoff just no-ops */
  }
}

/** Read + clear the stashed text — one-shot, so a later visit starts blank. */
export function takeHumanizerPrefill(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    if (value) sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}
