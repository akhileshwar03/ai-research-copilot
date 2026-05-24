import { apiRequest } from "@/services/api/client";
import type { DocumentsResponse } from "@/shared/types/api";

export const documentsApi = {
  list: () => apiRequest<DocumentsResponse>("/documents"),

  remove: (filename: string) =>
    apiRequest<{ message: string }>(`/documents/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    }),

  upload: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest<{ message: string }>("/upload", {
      method: "POST",
      body: formData,
    });
  },
};
