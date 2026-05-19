"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useState } from "react";

import {
  Message,
  ChatSession,
} from "@/types/chat";

export default function ChatWindow({
  sessions,
  setSessions,
  activeSessionId,
}: {
  sessions: ChatSession[];

  setSessions: React.Dispatch<
    React.SetStateAction<ChatSession[]>
  >;

  activeSessionId: number;

  selectedDocument: string;
}) {

  const [selectedDocument, setSelectedDocument] =
    useState("");

  const [input, setInput] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const activeSession =
    sessions.find(
      (session) =>
        session.id === activeSessionId
    );

  const messages =
    activeSession?.messages || [];

  const handleSendMessage = async () => {

    if (!input.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: input,
    };
    const currentInput = input;
    const updatedMessages = [
      ...messages,
      userMessage,
    ];

    setSessions((prev) =>
      prev.map((session) =>
        session.id === activeSessionId
          ? {
              ...session,
              title:
                session.messages.length <= 1
                  ? currentInput.slice(0, 30)
                  : session.title,

              messages: updatedMessages,
            }
          : session
      )
    );

    setInput("");

    setLoading(true);

    setSessions((prev) =>
      prev.map((session) => {

        if (
          session.id !== activeSessionId
        ) {
          return session;
        }

        return {
          ...session,
          messages: [
            ...updatedMessages,
            {
              role: "assistant",
              content: "",
            },
          ],
        };
      })
    );

    try {

      const response = await fetch(
        "http://127.0.0.1:8000/chat",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            messages: updatedMessages,
            document_id:
              selectedDocument,
          }),
        }
      );

      const reader =
        response.body?.getReader();

      if (!reader) return;

      const decoder =
        new TextDecoder();

      let streamedText = "";

      while (true) {

        const {
          done,
          value,
        } = await reader.read();

        if (done) break;

        streamedText +=
          decoder.decode(value);

        setSessions((prevSessions) =>
          prevSessions.map(
            (session) => {

              if (
                session.id !==
                activeSessionId
              ) {
                return session;
              }

              const updated =
                [...session.messages];

              updated[
                updated.length - 1
              ] = {
                role: "assistant",
                content: streamedText,

                sources:
                  response.headers.get(
                    "X-Sources"
                  ) || "",
              };

              return {
                ...session,
                messages: updated,
              };
            }
          )
        );
      }

    } catch (error) {

      console.error(error);

    }

    setLoading(false);
  };

  return (
    <div className="flex h-screen flex-col bg-black text-white">

      {/* Header */}
      <header className="border-b border-zinc-800 p-4">

        <div className="flex items-center justify-between">

          <h2 className="text-lg font-semibold">
            Research Session
          </h2>

          <select
            value={selectedDocument}
            onChange={(e) =>
              setSelectedDocument(
                e.target.value
              )
            }
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300"
          >

            <option value="">
              All Documents
            </option>

          </select>

        </div>

      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">

        <div className="mx-auto max-w-3xl space-y-4">

          {messages.map(
            (message, index) => (

              <div
                key={index}
                className={`rounded-2xl border border-zinc-800 p-4 ${
                  message.role === "user"
                    ? "bg-white text-black"
                    : "bg-zinc-900 text-zinc-200"
                }`}
              >

                <div className="prose prose-invert max-w-none prose-pre:border prose-pre:border-zinc-800 prose-pre:bg-zinc-950">

                  <ReactMarkdown
                    remarkPlugins={[
                      remarkGfm,
                    ]}
                  >
                    {message.content}
                  </ReactMarkdown>

                  {message.sources && (

                    <div className="mt-4 border-t border-zinc-800 pt-3">

                      <p className="text-xs text-zinc-500">
                        Sources
                      </p>

                      <p className="mt-1 text-xs text-zinc-400">
                        {message.sources}
                      </p>

                    </div>

                  )}

                </div>

              </div>

            )
          )}

          {loading && (

            <div className="rounded-2xl bg-zinc-900 p-4 text-zinc-400">

              AI is thinking...

            </div>

          )}

        </div>

      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-4">

        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-3">

          <input
            type="text"
            placeholder="Ask anything..."
            value={input}
            onChange={(e) =>
              setInput(
                e.target.value
              )
            }
            onKeyDown={(e) => {

              if (
                e.key === "Enter"
              ) {

                handleSendMessage();

              }

            }}
            className="flex-1 bg-transparent outline-none"
          />

          <button
            onClick={
              handleSendMessage
            }
            disabled={loading}
            className="rounded-xl bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
          >
            Send
          </button>

        </div>

      </div>

    </div>
  );
}