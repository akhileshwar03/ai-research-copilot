import { apiRequest } from "@/services/api/client";

export interface ExtractedText {
  text: string;
}

export const extractApi = {
  fromUrl: (url: string) =>
    apiRequest<ExtractedText>("/extract/url", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  fromImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest<ExtractedText>("/extract/image", {
      method: "POST",
      body: formData,
    });
  },
};
