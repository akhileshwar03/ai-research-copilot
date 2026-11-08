const KEY = "querex:checker-draft";

/** Keep the text a signed-out visitor pasted, so it is still there when they come back from signing in. */
export function saveCheckerDraft(text: string): void {
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    /* sessionStorage unavailable: the box is simply empty after sign-in */
  }
}

export function readCheckerDraft(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearCheckerDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
