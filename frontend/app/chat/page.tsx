"use client";

import {
  useEffect,
  useState,
} from "react";

import MainLayout from "@/components/layout/main-layout";

import Sidebar from "@/components/sidebar/sidebar";

import ChatWindow from "@/components/chat/chat-window";

import {
  loadSessions,
  saveSessions,
} from "@/lib/chat-storage";

import {
  ChatSession,
} from "@/types/chat";

export default function Home() {

  const [sessions, setSessions] =
    useState<ChatSession[]>([]);

  const [
    activeSessionId,
    setActiveSessionId,
  ] = useState<number | null>(
    null
  );

  const [documents, setDocuments] =
    useState<string[]>([]);

  const [
    selectedDocument,
    setSelectedDocument,
  ] = useState("");

  const [mounted, setMounted] =
    useState(false);

  const fetchDocuments =
    async () => {

      try {

        const response =
          await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/documents`
          );

        const data =
          await response.json();

        setDocuments(
          data.documents || []
        );

      } catch (error) {

        console.error(error);

      }
    };

  useEffect(() => {

    setMounted(true);

    const storedSessions =
      loadSessions();

    if (
      storedSessions.length > 0
    ) {

      setSessions(
        storedSessions
      );

      setActiveSessionId(
        storedSessions[0].id
      );

    } else {

      const defaultSession: ChatSession = {
        id: 1,
        title: "New Chat",
        pinned: false,
        messages: [
          {
            role: "assistant",
            content:
              "Welcome to AI Research Copilot.",
          },
        ],
      };

      setSessions([
        defaultSession,
      ]);

      setActiveSessionId(
        defaultSession.id
      );
    }

    fetchDocuments();

  }, []);

  useEffect(() => {

    if (
      sessions.length > 0
    ) {

      saveSessions(
        sessions
      );

    }

  }, [sessions]);

  if (
    !mounted ||
    activeSessionId === null
  ) {

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
          fetchDocuments={
            fetchDocuments
          }
          documents={documents}
          selectedDocument={
            selectedDocument
          }
          setSelectedDocument={
            setSelectedDocument
          }
          sessions={sessions}
          activeSessionId={
            activeSessionId
          }
          setActiveSessionId={
            setActiveSessionId
          }
          setSessions={
            setSessions
          }
        />
      }
    >
      <div className="flex h-full">

        {/* Chat */}
        <div className="flex-1">

          <ChatWindow
            selectedDocument={
              selectedDocument
            }
            sessions={sessions}
            setSessions={
              setSessions
            }
            activeSessionId={
              activeSessionId
            }
          />

        </div>

        {/* PDF Preview */}
        {selectedDocument && (

          <div className="hidden w-[420px] border-l border-zinc-800 bg-zinc-950 xl:block">

            <iframe
              src={`${process.env.NEXT_PUBLIC_API_URL}/uploads/${selectedDocument}`}
              className="h-full w-full"
            />

          </div>

        )}

      </div>

    </MainLayout>
  );
}