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

      const defaultSession = {
        id: 1,
        title: "New Chat",
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

  }, []);

  useEffect(() => {

    async function fetchDocuments() {

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
    </MainLayout>
  );
}