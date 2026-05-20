"use client";

import ReactMarkdown from "react-markdown";

import remarkGfm from "remark-gfm";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { Message } from "@/types/chat";

import {
  ChatSession,
} from "@/types/chat";

export default function ChatWindow({
  sessions,
  setSessions,
  activeSessionId,
  selectedDocument,

}: {
  sessions: ChatSession[];

  setSessions:
    React.Dispatch<
      React.SetStateAction<
        ChatSession[]
      >
    >;

  activeSessionId:
    number;

  selectedDocument: string;
}) {

  const activeSession =
    sessions.find(
      (s) =>
        s.id ===
        activeSessionId
    );

  const [input, setInput] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const bottomRef =
    useRef<HTMLDivElement>(
      null
    );

  useEffect(() => {

    bottomRef.current?.scrollIntoView(
      {
        behavior: "smooth",
      }
    );

  }, [activeSession?.messages]);

  if (!activeSession) {
    return null;
  }

  const handleSendMessage =
    async () => {

      if (
        !input.trim()
      ) return;

      const userMessage: Message = {
        role: "user",
        content: input,
      };

      const updatedMessages = [
        ...activeSession.messages,
        userMessage,
      ];

      setSessions((prev) =>
        prev.map((session) =>

          session.id ===
          activeSessionId
            ? {
                ...session,
                messages:
                  updatedMessages,
              }
            : session
        )
      );

      setInput("");

      setLoading(true);

      try {

        const response =
          await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/chat`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                messages:
                  updatedMessages,
                document_id:
                  selectedDocument,
              }),
            }
          );

        const reader =
          response.body?.getReader();

        if (!reader) {

          setLoading(false);

          return;
        }

        const decoder =
          new TextDecoder();

        let streamedText = "";

        while (true) {

          const {
            done,
            value,
          } =
            await reader.read();

          if (done) {
            break;
          }

          streamedText +=
            decoder.decode(
              value,
              {
                stream: true,
              }
            );

          setSessions((prev) =>
            prev.map((session) =>

              session.id ===
              activeSessionId
                ? {
                    ...session,
                    messages: [
                      ...updatedMessages,
                      {
                        role:
                          "assistant",
                        content:
                          streamedText,
                      },
                    ],
                  }
                : session
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

        <h2 className="text-lg font-semibold">
          Research Session
        </h2>

      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">

        <div className="mx-auto max-w-3xl space-y-4">

          {activeSession.messages.map(
            (
              message,
              index
            ) => (

              <div
                key={index}
                className={`rounded-2xl border border-zinc-800 p-4 ${
                  message.role ===
                  "user"
                    ? "bg-white text-black"
                    : "bg-zinc-900 text-zinc-200"
                }`}
              >

                <div className="prose prose-invert max-w-none">

                  <ReactMarkdown
                    remarkPlugins={[
                      remarkGfm,
                    ]}
                  >
                    {
                      message.content
                    }
                  </ReactMarkdown>

                </div>

              </div>

            )
          )}

          {loading && (

            <div className="rounded-2xl bg-zinc-900 p-4 text-zinc-400">

              AI is thinking...

            </div>

          )}

          <div ref={bottomRef} />

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