"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { documentsApi } from "@/services/api/documents-api";
import type { DocumentItem } from "@/shared/types/api";
import { useDocumentStore } from "@/stores/document-store";

const PROCESSING_POLL_INTERVAL_MS = 3000;

export function useDocuments() {
  const queryClient = useQueryClient();
  const selectedDocument = useDocumentStore((s) => s.selectedDocument);
  const setSelectedDocument = useDocumentStore((s) => s.setSelectedDocument);

  const query = useQuery({
    queryKey: ["documents"],
    queryFn: () => documentsApi.list(),
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
    mutationFn: (file: File) => documentsApi.upload(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => documentsApi.remove(filename),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
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
    refetchDocuments: query.refetch,
  };
}
