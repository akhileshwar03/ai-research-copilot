"use client";

import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      theme="dark"
      toastOptions={{
        style: {
          background: "#111",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "#fafafa",
          borderRadius: "12px",
          fontSize: "13px",
        },
      }}
    />
  );
}
