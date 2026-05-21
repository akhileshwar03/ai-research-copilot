"use client";

import {
  useEffect,
  useState,
} from "react";

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

  const [mounted, setMounted] =
    useState(false);

  useEffect(() => {

    setMounted(true);

  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <PdfViewerClient
      file={file}
    />
  );
}