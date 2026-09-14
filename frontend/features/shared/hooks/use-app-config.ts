"use client";

import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export type ToolKey = "research_copilot" | "humanizer" | "checker" | "realtime" | "paper_analyzer" | "extract";

export interface PublicAppConfig {
  tools: Record<ToolKey, boolean>;
  signups_enabled: boolean;
  maintenance_mode: boolean;
  announcement: string;
  chat_max_chars: number;
  humanize_max_words: number;
  checker_max_chars: number;
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
