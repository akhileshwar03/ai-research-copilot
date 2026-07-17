import { apiRequest } from "@/services/api/client";
import type { DocumentsResponse } from "@/shared/types/api";

export interface UploadResponse {
  document_id: string;
  name: string;
  upload_status: "processing" | "ready" | "failed";
  size_bytes: number;
}

export interface DocumentStatusResponse {
  document_id: string;
  upload_status: "processing" | "ready" | "failed";
  error_message: string | null;
}

export const documentsApi = {
  list: (skip = 0, limit = 100) =>
    apiRequest<DocumentsResponse>(`/documents?skip=${skip}&limit=${limit}`),

  status: (documentId: string) =>
    apiRequest<DocumentStatusResponse>(`/documents/${encodeURIComponent(documentId)}/status`),

  remove: (filename: string) =>
    apiRequest<{ message: string }>(`/documents/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    }),

  upload: async (file: File): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest<UploadResponse>("/upload", {
      method: "POST",
      body: formData,
    });
  },
};
