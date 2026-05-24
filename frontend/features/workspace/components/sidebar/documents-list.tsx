"use client";

import type { DocumentItem } from "@/shared/types/api";

interface DocumentsListProps {
  documents: DocumentItem[];
  selectedDocument: string;
  onSelect: (id: string) => void;
  onDeleteMany: (docs: DocumentItem[]) => Promise<void>;
}

export function DocumentsList({ documents, selectedDocument, onSelect, onDeleteMany }: DocumentsListProps) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Documents</p>
        {documents.length > 0 ? (
          <button
            className="text-xs text-zinc-400 hover:text-white"
            onClick={async () => {
              if (window.confirm(`Delete ${documents.length} documents?`)) {
                await onDeleteMany(documents);
              }
            }}
          >
            Clear All
          </button>
        ) : null}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {documents.map((doc) => (
          <button
            key={doc.id}
            onClick={() => onSelect(doc.id)}
            className={`min-w-[180px] rounded-xl border p-3 text-left text-sm transition ${
              selectedDocument === doc.id ? "border-white bg-white text-black" : "border-zinc-800 bg-zinc-900 text-zinc-300"
            }`}
          >
            <div className="truncate font-medium">{doc.name}</div>
            <div className="mt-1 text-xs text-zinc-500">PDF</div>
          </button>
        ))}
      </div>
    </div>
  );
}
