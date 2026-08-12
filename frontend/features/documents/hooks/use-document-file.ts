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
    // Actually cancels the in-flight request when superseded (rapid
    // toggling between documents, or the same document re-selected before
    // the first fetch finishes) — the `cancelled` flag alone only ever
    // suppressed the *result*, not the network call itself, so two
    // overlapping loads could both fetch and both create blob URLs, with
    // whichever resolved last winning regardless of which one the user
    // actually meant to see.
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    const load = async () => {
      try {
        const { accessToken, tokenType } = getStoredTokens();
        const response = await fetch(
          buildApiUrl(`/documents/${encodeURIComponent(documentId)}/file`),
          {
            headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error(`Failed to load PDF (${response.status})`);
        }
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (err) {
        // A superseded request aborting is expected, not a real failure —
        // surfacing it as an error would flash "Unable to load PDF" for a
        // fraction of a second every time the user switches documents.
        if (err instanceof DOMException && err.name === "AbortError") return;
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
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  return { blobUrl, error, isLoading };
}
