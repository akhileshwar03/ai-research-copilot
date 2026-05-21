"use client";

import { useEffect, useState } from "react";
import PdfViewer from "@/components/pdf/pdf-viewer";
import MainLayout from "@/components/layout/main-layout";
import Sidebar from "@/components/sidebar/sidebar";
import ChatWindow from "@/components/chat/chat-window";
import { fetchSessions } from "@/lib/chat-storage";
import { ChatSession } from "@/types/chat";

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [documents, setDocuments] = useState<string[]>([]);
  const [selectedDocument, setSelectedDocument] = useState("");
  const [mounted, setMounted] = useState(false);

  const fetchDocuments = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      if (!API_URL) {
        throw new Error("NEXT_PUBLIC_API_URL missing");
      }

      const response = await fetch(`${API_URL}/documents`);
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    async function loadData() {
      try {
        setMounted(true);
        const userId = 1;
        const backendSessions = await fetchSessions(userId);

        if (backendSessions.length > 0) {
          setSessions(backendSessions);
          setActiveSessionId(backendSessions[0].id);
        } else {
          const defaultSession = {
            id: Date.now(),
            title: "New Chat",
            pinned: false,
            messages: [
              {
                role: "assistant",
                content: "Welcome to AI Research Copilot.",
              },
            ],
          };
          setSessions([defaultSession]);
          setActiveSessionId(defaultSession.id);
        }

        await fetchDocuments();
      } catch (error) {
        console.error(error);
      }
    }

    loadData();
  }, []);

  if (!mounted || activeSessionId === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        Loading...
      </div>
    );
  }

  return (
    <MainLayout
      sidebar={
        <Sidebar
          fetchDocuments={fetchDocuments}
          documents={documents}
          selectedDocument={selectedDocument}
          setSelectedDocument={setSelectedDocument}
          sessions={sessions}
          activeSessionId={activeSessionId}
          setActiveSessionId={setActiveSessionId}
          setSessions={setSessions}
        />
      }
    >
      <div className="flex h-full">
        <div className="flex-1">
          <ChatWindow
            selectedDocument={selectedDocument}
            sessions={sessions}
            setSessions={setSessions}
            activeSessionId={activeSessionId}
          />
        </div>

        {selectedDocument && (
          <div className="hidden w-[420px] border-l border-zinc-800 bg-zinc-950 xl:block">
            <PdfViewer
              file={`${process.env.NEXT_PUBLIC_API_URL}/uploads/${selectedDocument}`}
            />
          </div>
        )}
      </div>
    </MainLayout>
  );
}