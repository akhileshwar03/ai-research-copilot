"use client";

import dynamic from "next/dynamic";

import ChatWindow from "@/features/chat/components/chat-window";
import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import { useAuthStore } from "@/stores/auth-store";
import { useDocumentStore } from "@/stores/document-store";
import MainLayout from "@/components/layout/main-layout";
import Sidebar from "@/features/workspace/components/sidebar/sidebar";
import { buildStaticUrl } from "@/constants/config";

const PdfViewer = dynamic(() => import("@/components/pdf/pdf-viewer"), { ssr: false });

export default function ChatPage() {
  const { isReady, isAuthenticated } = useAuthGuard();
  const email = useAuthStore((s) => s.email);
  const selectedDocument = useDocumentStore((s) => s.selectedDocument);

  if (!isReady || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#080808]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
          <p className="text-[12px] text-zinc-600">Loading workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout sidebar={<Sidebar email={email} />}>
      <div className="flex h-full">
        <div className="flex-1 overflow-hidden">
          <ChatWindow email={email} selectedDocument={selectedDocument} />
        </div>

        {selectedDocument ? (
          <div className="hidden w-[420px] shrink-0 border-l border-white/[0.05] bg-[#0a0a0a] xl:block">
            <PdfViewer file={buildStaticUrl(`/uploads/${selectedDocument}`)} />
          </div>
        ) : null}
      </div>
    </MainLayout>
  );
}
