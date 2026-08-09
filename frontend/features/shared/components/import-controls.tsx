"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { extractApi } from "@/services/api/extract-api";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

/** "Import from URL" + "Upload image" affordances shared by the Humanizer
 *  and Checker input panels — both just want extracted plain text handed
 *  back so the caller can drop it into its own textarea/flow. */
export function ImportControls({
  onExtracted,
  disabled,
}: {
  onExtracted: (text: string) => void;
  disabled?: boolean;
}) {
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const urlMutation = useMutation({
    mutationFn: (value: string) => extractApi.fromUrl(value),
    onSuccess: (data) => {
      onExtracted(data.text);
      setUrlOpen(false);
      setUrl("");
      toast.success("Imported text from URL");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't import that URL"),
  });

  const imageMutation = useMutation({
    mutationFn: (file: File) => extractApi.fromImage(file),
    onSuccess: (data) => {
      onExtracted(data.text);
      toast.success("Extracted text from image");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't read that image"),
  });

  const handleFilePicked = (file: File | undefined) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPEG, or WEBP images are supported");
      return;
    }
    imageMutation.mutate(file);
  };

  const isBusy = urlMutation.isPending || imageMutation.isPending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => setUrlOpen((v) => !v)}
        disabled={disabled || isBusy}
        className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-[var(--marketing-accent-text)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
        {urlMutation.isPending ? "Fetching…" : "Import URL"}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleFilePicked(e.target.files?.[0])}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || isBusy}
        className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-[var(--marketing-accent-text)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 4.5h18a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 18V6A1.5 1.5 0 013 4.5z" />
        </svg>
        {imageMutation.isPending ? "Reading image…" : "Upload image"}
      </button>

      {urlOpen && (
        <div className="flex w-full items-center gap-1.5">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim() && !urlMutation.isPending) urlMutation.mutate(url.trim());
            }}
            placeholder="https://example.com/article"
            className="flex-1 rounded-md border border-[var(--border-subtle)] bg-transparent px-2 py-1 text-[12px] text-[var(--text-primary)] outline-none focus-accent placeholder:text-zinc-600"
          />
          <button
            onClick={() => url.trim() && urlMutation.mutate(url.trim())}
            disabled={!url.trim() || urlMutation.isPending}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: "var(--marketing-accent)" }}
          >
            Fetch
          </button>
        </div>
      )}
    </div>
  );
}
