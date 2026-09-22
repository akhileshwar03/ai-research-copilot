"use client";

import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export type ToolKey = "research_copilot" | "humanizer" | "checker" | "realtime" | "paper_analyzer" | "extract";

/** The 6 pages with their own background: the 5 tool pages (same keys as
 *  ToolKey, minus "extract" which has no standalone page) plus "landing"
 *  for the public marketing page. Matches backend BACKGROUND_PAGES exactly —
 *  keep in sync if a page is ever added or removed on either side. */
export type BackgroundPage = "landing" | "research_copilot" | "humanizer" | "checker" | "realtime" | "paper_analyzer";
export const BACKGROUND_PAGES: BackgroundPage[] = [
  "landing", "research_copilot", "humanizer", "checker", "realtime", "paper_analyzer",
];

export interface BackgroundConfig {
  mode: "dynamic" | "static";
  image_url: string | null;
}

export interface PublicAppConfig {
  tools: Record<ToolKey, boolean>;
  signups_enabled: boolean;
  maintenance_mode: boolean;
  announcement: string;
  chat_max_chars: number;
  humanize_max_words: number;
  checker_max_chars: number;
  github_link_enabled: boolean;
  github_repo_url: string;
  support_email: string;
  legal_entity_name: string;
  logo_url: string | null;
  backgrounds: Record<BackgroundPage, BackgroundConfig>;
}

/** Which tool each product route belongs to — drives nav state and the
 *  "temporarily unavailable" notice when an admin switches a tool off. */
export const ROUTE_TOOL: Record<string, ToolKey> = {
  "/chat": "research_copilot",
  "/humanizer": "humanizer",
  "/checker": "checker",
  "/realtime": "realtime",
  "/paper-analyzer": "paper_analyzer",
};

const FALLBACK: PublicAppConfig = {
  tools: {
    research_copilot: true,
    humanizer: true,
    checker: true,
    realtime: true,
    paper_analyzer: true,
    extract: true,
  },
  signups_enabled: true,
  maintenance_mode: false,
  announcement: "",
  chat_max_chars: 4000,
  humanize_max_words: 3000,
  checker_max_chars: 20000,
  // Falls back to hidden, not to a hardcoded repo URL — if the config request fails,
  // showing nothing is the safe default, not silently exposing a repo an admin may
  // have since turned off.
  github_link_enabled: false,
  github_repo_url: "",
  support_email: "",
  legal_entity_name: "Querex",
  // Falls back to null (the default sparkle mark), never a stale/broken
  // image URL from a failed config fetch.
  logo_url: null,
  // Falls back to every page's built-in animated scene — never to a static
  // image URL that might not resolve, so a transient config-fetch failure
  // degrades to "the background that always worked," not a broken one.
  backgrounds: Object.fromEntries(
    BACKGROUND_PAGES.map((page) => [page, { mode: "dynamic", image_url: null }])
  ) as Record<BackgroundPage, BackgroundConfig>,
};

/** Public runtime config (no auth). Cached for a minute; failure falls back
 *  to "everything on" so a transient API blip never hides the product. */
export function useAppConfig() {
  const query = useQuery({
    queryKey: ["app-config"],
    queryFn: () => apiRequest<PublicAppConfig>("/app/config", { skipAuth: true }),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  return { config: query.data ?? FALLBACK, isLoaded: Boolean(query.data) };
}
