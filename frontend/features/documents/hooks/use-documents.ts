"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { documentsApi } from "@/services/api/documents-api";
import type { DocumentItem } from "@/shared/types/api";
import { useDocumentStore } from "@/stores/document-store";

export function useDocuments() {
  const queryClient = useQueryClient();
  const selectedDocument = useDocumentStore((s) => s.selectedDocument);
  const setSelectedDocument = useDocumentStore((s) => s.setSelectedDocument);

  const query = useQuery({
    queryKey: ["documents"],
    queryFn: () => documentsApi.list(),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => documentsApi.upload(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => documentsApi.remove(filename),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  const documents: DocumentItem[] = query.data?.documents || [];

  return {
    documents,
    selectedDocument,
    setSelectedDocument,
    isLoadingDocuments: query.isLoading,
    uploadDocument: uploadMutation.mutateAsync,
    isUploadingDocument: uploadMutation.isPending,
    deleteDocument: deleteMutation.mutateAsync,
    refetchDocuments: query.refetch,
  };
}
