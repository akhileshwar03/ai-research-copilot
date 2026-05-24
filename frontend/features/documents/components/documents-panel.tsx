"use client";

import { useState } from "react";
import { toast } from "sonner";

import type { DocumentItem } from "@/shared/types/api";
import { useDocumentStore } from "@/stores/document-store";
import { DocumentSkeleton } from "@/components/ui/skeleton";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DocumentsPanelProps {
  documents: DocumentItem[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isUploading: boolean;
  isLoading?: boolean;
}

function SortIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
    </svg>
  );
}

function PinIcon({ filled }: { filled?: boolean }) {
  return (
    <svg className="h-3.5 w-3.5" fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

export function DocumentsPanel({ documents, onUpload, onDelete, isUploading, isLoading = false }: DocumentsPanelProps) {
  const {
    selectedDocument, setSelectedDocument,
    checkedDocuments, toggleChecked, setAllChecked, clearChecked,
    pinnedDocuments, togglePinned,
    sortOrder, setSortOrder,
  } = useDocumentStore();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sorted = [...documents].sort((a, b) => {
    const aPinned = pinnedDocuments.includes(a.id);
    const bPinned = pinnedDocuments.includes(b.id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (sortOrder === "alpha") return a.name.localeCompare(b.name);
    return 0; // preserve server order (already latest-first)
  });

  const allChecked = documents.length > 0 && checkedDocuments.length === documents.length;
  const someChecked = checkedDocuments.length > 0;

  const handleDelete = async (id: string, name: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
      if (selectedDocument === id) setSelectedDocument("");
      clearChecked();
      toast.success(`"${name}" removed`);
    } catch {
      toast.error("Failed to delete document");
    } finally {
      setDeletingId(null);
    }
  };

  const handleBatchDelete = async () => {
    const toDelete = documents.filter((d) => checkedDocuments.includes(d.id));
    try {
      await Promise.all(toDelete.map((d) => onDelete(d.id)));
      if (checkedDocuments.includes(selectedDocument)) setSelectedDocument("");
      clearChecked();
      toast.success(`${toDelete.length} document${toDelete.length > 1 ? "s" : ""} removed`);
    } catch {
      toast.error("Failed to delete selected documents");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await onUpload(file);
      toast.success(`"${file.name}" uploaded`);
    } catch {
      toast.error("Upload failed");
    }
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Documents</span>
        <div className="flex items-center gap-1">
          {/* Sort dropdown */}
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300"
                title="Sort documents"
              >
                <SortIcon />
                <span>{sortOrder === "latest" ? "Latest" : "A–Z"}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setSortOrder("latest")}>
                <span className={sortOrder === "latest" ? "text-white" : ""}>Latest added</span>
                {sortOrder === "latest" && <CheckIcon />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOrder("alpha")}>
                <span className={sortOrder === "alpha" ? "text-white" : ""}>Alphabetical</span>
                {sortOrder === "alpha" && <CheckIcon />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuRoot>

          {/* Upload */}
          <label className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300">
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} disabled={isUploading} />
            <UploadIcon />
          </label>
        </div>
      </div>

      {/* Batch action bar */}
      {someChecked && (
        <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-3 py-2">
          <span className="text-[12px] text-zinc-400">{checkedDocuments.length} selected</span>
          <div className="flex gap-2">
            <button
              onClick={handleBatchDelete}
              className="rounded-md px-2 py-1 text-[11px] text-red-400 transition hover:bg-red-500/10"
            >
              Delete all
            </button>
            <button
              onClick={clearChecked}
              className="rounded-md px-2 py-1 text-[11px] text-zinc-500 transition hover:bg-white/[0.05]"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      {isLoading ? (
        <div className="flex flex-col gap-1">
          <DocumentSkeleton />
          <DocumentSkeleton />
          <DocumentSkeleton />
        </div>
      ) : sorted.length === 0 ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.07] bg-[#0d0d0d] px-4 py-8 text-center transition hover:border-white/[0.14] hover:bg-white/[0.02]">
          <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} disabled={isUploading} />
          <UploadIcon />
          <span className="text-[12px] text-zinc-600">{isUploading ? "Uploading…" : "Drop PDF or click to upload"}</span>
        </label>
      ) : (
        <div className="flex flex-col gap-1">
          {/* Select-all row */}
          <div className="flex items-center gap-2 px-1 pb-1">
            <button
              onClick={() => allChecked ? clearChecked() : setAllChecked(documents.map((d) => d.id))}
              className={[
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                allChecked
                  ? "border-white bg-white text-black"
                  : "border-white/[0.15] bg-transparent hover:border-white/30",
              ].join(" ")}
            >
              {allChecked && <CheckIcon />}
            </button>
            <span className="text-[11px] text-zinc-700">Select all</span>
          </div>

          {sorted.map((doc) => {
            const isActive = selectedDocument === doc.id;
            const isChecked = checkedDocuments.includes(doc.id);
            const isPinned = pinnedDocuments.includes(doc.id);
            const isDeleting = deletingId === doc.id;

            return (
              <div
                key={doc.id}
                className={[
                  "group flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all duration-150",
                  isActive
                    ? "border-white/20 bg-white/[0.07]"
                    : "border-white/[0.06] bg-[#111] hover:border-white/[0.10] hover:bg-white/[0.04]",
                  isDeleting ? "opacity-50" : "",
                ].join(" ")}
              >
                {/* Checkbox */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleChecked(doc.id); }}
                  className={[
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                    isChecked
                      ? "border-white bg-white text-black"
                      : "border-white/[0.15] bg-transparent hover:border-white/30",
                  ].join(" ")}
                >
                  {isChecked && <CheckIcon />}
                </button>

                {/* File icon + name */}
                <button
                  onClick={() => setSelectedDocument(isActive ? "" : doc.id)}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <FileIcon />
                  <div className="min-w-0 text-left">
                    <p className={["truncate text-[12px] font-medium leading-tight", isActive ? "text-white" : "text-zinc-300"].join(" ")}>
                      {doc.name.replace(/\.pdf$/i, "")}
                    </p>
                    <p className="text-[10px] text-zinc-700">PDF</p>
                  </div>
                </button>

                {/* Pin indicator */}
                {isPinned && (
                  <span className="text-amber-500/70">
                    <PinIcon filled />
                  </span>
                )}

                {/* Context menu */}
                <DropdownMenuRoot>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-700 opacity-0 transition group-hover:opacity-100 hover:bg-white/[0.08] hover:text-zinc-300 focus:opacity-100"
                    >
                      <DotsIcon />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Document</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => { setSelectedDocument(doc.id); }}>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      View in panel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => togglePinned(doc.id)}>
                      <PinIcon filled={isPinned} />
                      {isPinned ? "Unpin" : "Pin to top"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        toggleChecked(doc.id);
                        const others = documents.filter((d) => d.id !== doc.id && checkedDocuments.includes(d.id));
                        if (others.length === 0 && !checkedDocuments.includes(doc.id)) {
                          toast.info("Select more documents to compare");
                        }
                      }}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
                      Compare / select
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onClick={() => handleDelete(doc.id, doc.name)}>
                      <TrashIcon />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuRoot>
              </div>
            );
          })}

          {/* Upload more */}
          <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.06] py-2 text-[11px] text-zinc-700 transition hover:border-white/[0.12] hover:text-zinc-500">
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} disabled={isUploading} />
            <UploadIcon />
            {isUploading ? "Uploading…" : "Add PDF"}
          </label>
        </div>
      )}
    </div>
  );
}
