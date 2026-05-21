"use client";

import {
  Document,
  Page,
  pdfjs,
} from "react-pdf";

import {
  useState,
} from "react";

import "react-pdf/dist/Page/TextLayer.css";

import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfViewerClient({
  file,
}: {
  file: string;
}) {

  const [numPages,
    setNumPages] =
    useState(0);

  function onDocumentLoadSuccess({
    numPages,
  }: {
    numPages: number;
  }) {

    setNumPages(
      numPages
    );
  }

  return (

    <div className="h-full overflow-auto bg-zinc-950 p-4">

      <Document
        file={file}
        onLoadSuccess={
          onDocumentLoadSuccess
        }
        loading={
          <div className="text-zinc-400">
            Loading PDF...
          </div>
        }
      >

        <div className="space-y-4">

          {Array.from(
            new Array(numPages),
            (_, index) => (

              <Page
                key={`page_${
                  index + 1
                }`}
                pageNumber={
                  index + 1
                }
                width={380}
              />

            )
          )}

        </div>

      </Document>

    </div>

  );
}