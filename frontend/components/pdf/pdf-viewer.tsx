"use client";

import dynamic from "next/dynamic";

const PdfViewerClient =
  dynamic(
    () =>
      import(
        "./pdf-viewer-client"
      ),
    {
      ssr: false,
    }
  );

export default function PdfViewer({
  file,
}: {
  file: string;
}) {
  return (
    <PdfViewerClient
      file={file}
    />
  );
}
