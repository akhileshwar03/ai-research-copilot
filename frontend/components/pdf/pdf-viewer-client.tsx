"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// Bundled locally rather than fetched from a CDN (was unpkg.com, pinned to
// the installed pdfjs-dist version string at runtime) — viewing your own
// uploaded document is a core feature and shouldn't depend on a third-party
// CDN being reachable, unrate-limited, and still hosting that exact version.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PdfViewerClientProps {
  file: string;
}

export default function PdfViewerClient({ file }: PdfViewerClientProps) {
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setLoadError(null);
    setNumPages(numPages);
  }

  function onDocumentLoadError(error: Error) {
    // Without this, a corrupt/encrypted/unsupported PDF (the blob itself
    // fetched fine, so use-document-file's own error path never fires) left
    // the panel stuck on "Loading PDF..." forever with no feedback at all.
    setLoadError(error.message || "This PDF could not be displayed");
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-zinc-950 p-6 text-center">
        <p className="text-[13px] font-medium text-zinc-300">Unable to display this PDF</p>
        <p className="text-[12px] text-zinc-600">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-zinc-950 p-4">
      <Document
        file={file}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={<div className="text-zinc-400">Loading PDF...</div>}
      >
        <div className="space-y-4">
          {Array.from(new Array(numPages), (_, index) => (
            <Page key={`page_${index + 1}`} pageNumber={index + 1} width={380} />
          ))}
        </div>
      </Document>
    </div>
  );
}
