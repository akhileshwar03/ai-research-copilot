"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { buildApiUrl } from "@/constants/config";
import { getStoredTokens } from "@/shared/lib/token-storage";

/**
 * Fetch a document's PDF through the authenticated endpoint and expose it as
 * a blob URL for react-pdf. Documents are no longer served from a public
 * static mount, so a plain URL (no Authorization header) would 401.
 *
 * Backed by react-query so switching documents cancels the superseded
 * request (via the query signal) and the blob URL is revoked when it is no
 * longer displayed. gcTime is 0 so a revoked URL can never be served back
 * from the cache.
 */
export function useDocumentFile(documentId: string | null) {
  const query = useQuery({
    queryKey: ["document-file", documentId],
    enabled: Boolean(documentId),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const { accessToken, tokenType } = getStoredTokens();
      const response = await fetch(buildApiUrl(`/documents/${encodeURIComponent(documentId ?? "")}/file`), {
        headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
        signal,
      });
      if (!response.ok) {
        throw new Error(`Failed to load PDF (${response.status})`);
      }
      return URL.createObjectURL(await response.blob());
    },
  });

  const blobUrl = query.data ?? null;
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  return {
    blobUrl,
    error: query.error instanceof Error ? query.error.message : query.error ? "Failed to load PDF" : null,
    isLoading: query.isLoading,
  };
}
