/**
 * Client-side mirror of backend/app/core/founder_links.py, for instant feedback in the admin form.
 * The server is the authority and re-checks everything; keep the two in step (same hosts, same rules).
 */
export type FounderLinkKey = "founder_linkedin_url" | "founder_github_url" | "founder_x_url" | "founder_website_url";

export const FOUNDER_LINK_RULES: Record<FounderLinkKey, { label: string; hosts: string[] | null; placeholder: string }> = {
  founder_linkedin_url: { label: "LinkedIn", hosts: ["linkedin.com"], placeholder: "https://www.linkedin.com/in/your-name" },
  founder_github_url: { label: "GitHub", hosts: ["github.com"], placeholder: "https://github.com/your-username" },
  founder_x_url: { label: "X (Twitter)", hosts: ["x.com", "twitter.com"], placeholder: "https://x.com/your-handle" },
  founder_website_url: { label: "Website", hosts: null, placeholder: "https://your-site.com" },
};

/** Returns an error message, or null when the value is acceptable (empty means "not shown"). */
export function validateFounderLink(key: FounderLinkKey, raw: string): string | null {
  const { label, hosts } = FOUNDER_LINK_RULES[key];
  const url = raw.trim();
  if (!url) return null;
  if (/[\s\u0000-\u001f]/.test(url)) return `${label}: must not contain spaces or control characters`;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `${label}: must be a full address starting with https://`;
  }
  if (parsed.protocol !== "https:") return `${label}: must start with https://`;
  if (parsed.username || parsed.password) return `${label}: must be a plain address without a username or password`;

  const host = parsed.hostname.toLowerCase();
  if (hosts) {
    if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) return `${label}: must be an address on ${hosts.join(" or ")}`;
    if (parsed.pathname.replace(/\//g, "") === "") return `${label}: must point to your profile, not just the site's home page`;
    return null;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return `${label}: must use a domain name, not an IP address`;
  if (!host.includes(".") || host === "localhost" || /\.(local|internal|localhost)$/.test(host)) {
    return `${label}: must be a public website address`;
  }
  return null;
}
