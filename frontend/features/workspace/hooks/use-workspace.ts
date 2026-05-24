"use client";

import { useDocuments } from "@/features/documents/hooks/use-documents";
import { useSessions } from "@/features/sessions/hooks/use-sessions";

export function useWorkspace(email: string | null) {
  const sessions = useSessions(email);
  const documents = useDocuments();

  return {
    ...sessions,
    ...documents,
    isWorkspaceLoading: sessions.isLoadingSessions || documents.isLoadingDocuments,
  };
}
