"use client";

import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export interface FounderLink {
  kind: "linkedin" | "github" | "x" | "website";
  label: string;
  url: string;
}

/** What GET /app/founder returns. `enabled` is false (and every field empty) unless the admin has switched
 *  the section on AND entered a name and a note. */
export interface FounderPublic {
  enabled: boolean;
  name: string;
  title: string;
  note: string;
  photo_url: string | null;
  links: FounderLink[];
}

export function useFounder() {
  return useQuery({
    queryKey: ["founder"],
    queryFn: () => apiRequest<FounderPublic>("/app/founder", { skipAuth: true }),
    staleTime: 60_000,
  });
}
