"use client";

import { useEffect, useState } from "react";

import { buildApiUrl } from "@/constants/config";
import { getStoredTokens } from "@/shared/lib/token-storage";

/**
 * Fetch a document's PDF through the authenticated endpoint and expose it as
 * a blob URL for react-pdf. Documents are no longer served from a public
 * static mount, so a plain URL (no Authorization header) would 401.
 */
export function useDocumentFile(documentId: string | null) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!documentId) {
      setBlobUrl(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setIsLoading(true);
    setError(null);

    const load = async () => {
      try {
        const { accessToken, tokenType } = getStoredTokens();
        const response = await fetch(
          buildApiUrl(`/documents/${encodeURIComponent(documentId)}/file`),
          { headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {} },
        );
        if (!response.ok) {
          throw new Error(`Failed to load PDF (${response.status})`);
        }
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
          setBlobUrl(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  return { blobUrl, error, isLoading };
}
