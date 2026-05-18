"use client";

import { useState } from "react";

export default function UploadBox() {

  const [uploading, setUploading] =
    useState(false);

  const [successMessage, setSuccessMessage] =
    useState("");

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {

    const file = event.target.files?.[0];

    if (!file) return;

    const formData = new FormData();

    formData.append("file", file);

    setUploading(true);

    try {

      const response = await fetch(
        "http://127.0.0.1:8000/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      setSuccessMessage(
        `${file.name} uploaded successfully`
      );

    } catch (error) {

      console.error(error);

      setSuccessMessage(
        "Upload failed"
      );

    }

    setUploading(false);
  };

  return (
    <div className="space-y-3">

      <label
        className="
          flex cursor-pointer items-center
          justify-center rounded-2xl
          border border-dashed border-zinc-700
          bg-zinc-900 p-6 text-sm
          text-zinc-400 transition
          hover:border-zinc-500
        "
      >

        <input
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileUpload}
        />

        {
          uploading
            ? "Uploading PDF..."
            : "Upload PDF"
        }

      </label>

      {
        successMessage && (
          <p className="text-xs text-zinc-500">
            {successMessage}
          </p>
        )
      }

    </div>
  );
}