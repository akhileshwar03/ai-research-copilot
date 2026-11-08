const KEY = "querex:return-to";
/** Only these paths may be returned to after sign-in, so a stored value can never send someone off-site. */
const ALLOWED = new Set(["/checker"]);

/** Remember where to send the visitor once they have signed in. */
export function setReturnTo(path: string): void {
  if (!ALLOWED.has(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* sessionStorage unavailable: sign-in just lands on the home page */
  }
}

/** Where to go after sign-in: the remembered page, or the home page. Does not clear it (see clearReturnTo). */
export function peekReturnTo(): string {
  try {
    const value = sessionStorage.getItem(KEY);
    return value && ALLOWED.has(value) ? value : "/";
  } catch {
    return "/";
  }
}

/** Forget the remembered page. Called by the page the visitor lands on, not by the sign-in code, so that two
 *  sign-in handlers racing each other both see the same destination. */
export function clearReturnTo(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
