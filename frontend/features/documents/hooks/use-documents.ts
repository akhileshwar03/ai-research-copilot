"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { documentsApi } from "@/services/api/documents-api";
import type { DocumentItem, DocumentsResponse } from "@/shared/types/api";
import { useDocumentStore } from "@/stores/document-store";
import { useAppConfig } from "@/features/shared/hooks/use-app-config";
import { oversizeMessage } from "@/shared/lib/upload-limits";

const PROCESSING_POLL_INTERVAL_MS = 3000;

export function useDocuments(email: string | null) {
  const queryClient = useQueryClient();
  const selectedDocument = useDocumentStore((s) => s.selectedDocument);
  const setSelectedDocument = useDocumentStore((s) => s.setSelectedDocument);
  const { config } = useAppConfig();

  const query = useQuery({
    queryKey: ["documents"],
    queryFn: () => documentsApi.list(),
    // Deferred until auth resolves — mirrors useSessions. Without this the
    // query fires (and caches an empty/401 result) before the access token
    // is available on first mount, and nothing ever re-triggers it, so
    // documents silently never appear after a fresh login.
    enabled: Boolean(email),
    // Poll automatically while any document is still being processed.
    // Once all documents are ready (or failed), the interval drops to false
    // and polling stops — no unnecessary background requests.
    refetchInterval: (query) => {
      const docs = query.state.data?.documents ?? [];
      const hasProcessing = docs.some((d) => d.upload_status === "processing");
      return hasProcessing ? PROCESSING_POLL_INTERVAL_MS : false;
    },
  });

  const uploadMutation = useMutation({
    // Single chokepoint for every upload entry point (the picker, drag-drop, and the command
    // palette all funnel through uploadDocument) -- checked here once instead of duplicated at
    // each call site. Instant, pre-upload feedback instead of waiting through a whole upload
    // just to be rejected at the end (a real production case: a real user waited 6.5s for a
    // 413 that a client-side size check could have caught immediately).
    mutationFn: (file: File) => {
      const oversize = oversizeMessage(file, config.max_upload_size_mb);
      if (oversize) return Promise.reject(new Error(oversize));
      return documentsApi.upload(file);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => documentsApi.remove(filename),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  // Optimistic: flips the pin instantly in the cache (so the list re-sorts
  // right away) and rolls back if the request fails, rather than waiting a
  // full round trip for a checkbox-level toggle to visibly react.
  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => documentsApi.setPinned(id, pinned),
    onMutate: async ({ id, pinned }) => {
      await queryClient.cancelQueries({ queryKey: ["documents"] });
      const previous = queryClient.getQueryData<DocumentsResponse>(["documents"]);
      queryClient.setQueryData<DocumentsResponse>(["documents"], (old) => {
        if (!old) return old;
        return { ...old, documents: old.documents.map((d) => (d.id === id ? { ...d, pinned } : d)) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["documents"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  const documents: DocumentItem[] = query.data?.documents ?? [];

  return {
    documents,
    retentionDays: query.data?.retention_days ?? 0,
    selectedDocument,
    setSelectedDocument,
    isLoadingDocuments: query.isLoading,
    uploadDocument: uploadMutation.mutateAsync,
    isUploadingDocument: uploadMutation.isPending,
    deleteDocument: deleteMutation.mutateAsync,
    setDocumentPinned: (id: string, pinned: boolean) => pinMutation.mutateAsync({ id, pinned }),
    refetchDocuments: query.refetch,
  };
}
