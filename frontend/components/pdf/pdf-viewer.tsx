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
  jumpToPage,
  jumpNonce,
}: {
  file: string;
  jumpToPage?: number | null;
  jumpNonce?: number;
}) {
  return (
    <PdfViewerClient
      file={file}
      jumpToPage={jumpToPage}
      jumpNonce={jumpNonce}
    />
  );
}
