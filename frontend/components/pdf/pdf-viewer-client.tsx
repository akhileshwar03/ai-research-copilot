"use client";

import { useEffect, useRef, useState } from "react";
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
  /** Page to scroll to (1-indexed), from clicking a page citation in a chat reply. */
  jumpToPage?: number | null;
  /** Bumped on every jump request, including a repeat click on the same page — see
   * document-store.ts's `pdfJumpRequest`. Included in the scroll effect's deps so a second
   * click on the same citation re-scrolls even though `jumpToPage` alone wouldn't have changed. */
  jumpNonce?: number;
}

export default function PdfViewerClient({ file, jumpToPage, jumpNonce }: PdfViewerClientProps) {
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Runs once the document has actually loaded (numPages > 0) so a jump requested before the
  // PDF finished loading (e.g. clicking a citation right after switching documents) isn't
  // silently dropped — it fires again as soon as numPages becomes available.
  useEffect(() => {
    if (!jumpToPage || numPages === 0) return;
    pageRefs.current.get(jumpToPage)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [jumpToPage, jumpNonce, numPages]);

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
          {Array.from(new Array(numPages), (_, index) => {
            const pageNumber = index + 1;
            return (
              <div
                key={`page_${pageNumber}`}
                ref={(el) => {
                  if (el) pageRefs.current.set(pageNumber, el);
                  else pageRefs.current.delete(pageNumber);
                }}
              >
                <Page pageNumber={pageNumber} width={380} />
              </div>
            );
          })}
        </div>
      </Document>
    </div>
  );
}
