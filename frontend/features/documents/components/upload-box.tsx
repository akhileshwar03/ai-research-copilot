"use client";

import { useState } from "react";

import { useDocuments } from "@/features/documents/hooks/use-documents";

export function DocumentsUploadBox() {
  const [successMessage, setSuccessMessage] = useState("");
  const { uploadDocument, isUploadingDocument } = useDocuments();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      await uploadDocument(file);
      setSuccessMessage(`${file.name} uploaded successfully`);
    } catch {
      setSuccessMessage("Upload failed");
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900 p-6 text-sm text-zinc-400 transition hover:border-zinc-500">
        <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
        {isUploadingDocument ? "Uploading PDF..." : "Upload PDF"}
      </label>

      {successMessage && <p className="text-xs text-zinc-500">{successMessage}</p>}
    </div>
  );
}
