const FORWARDED_PARAMS = ["start", "end", "preset", "compare", "user_id", "user_email"] as const;

/** Query string ("?a=b" or "") carrying the analytics filters between admin views. */
export function forwardedQuery(source: { get(name: string): string | null }): string {
  const q = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) {
    const value = source.get(key);
    if (value) q.set(key, value);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
