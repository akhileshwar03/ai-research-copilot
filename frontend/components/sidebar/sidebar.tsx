"use client";

import { useState } from "react";

import UploadBox from "../upload/upload-box";

import {
  ChatSession,
} from "@/types/chat";

export default function Sidebar({
  sessions,
  activeSessionId,
  setActiveSessionId,
  setSessions,
  documents,
  selectedDocument,
  setSelectedDocument,

}: {
  sessions: ChatSession[];

  activeSessionId: number | null;

  setActiveSessionId:
    React.Dispatch<
      React.SetStateAction<number | null>
    >;

  setSessions:
    React.Dispatch<
      React.SetStateAction<
        ChatSession[]
      >
    >;

  documents: string[];

  selectedDocument: string;

  setSelectedDocument:
    React.Dispatch<
      React.SetStateAction<string>
    >;
}) {

  const [
    documentSearch,
    setDocumentSearch,
  ] = useState("");

  const [
    sortOption,
    setSortOption,
  ] = useState("latest");

  const filteredDocuments =
    [...documents]

      .filter((doc) =>
        doc
          .toLowerCase()
          .includes(
            documentSearch.toLowerCase()
          )
      )

      .sort((a, b) => {

        if (
          sortOption === "a-z"
        ) {

          return a.localeCompare(b);

        }

        if (
          sortOption === "z-a"
        ) {

          return b.localeCompare(a);

        }

        return 0;
      });

  const handleNewChat = () => {

    const newSession: ChatSession = {
      id: Date.now(),

      title: "New Chat",

      messages: [
        {
          role: "assistant",
          content:
            "Welcome to AI Research Copilot.",
        },
      ],
    };

    setSessions((prev) => [
      newSession,
      ...prev,
    ]);

    setActiveSessionId(
      newSession.id
    );
  };

  return (
    <div className="flex h-full flex-col p-4">

      {/* Logo */}
      <div>

        <h1 className="text-2xl font-bold">
          AI Research Copilot
        </h1>

        <p className="mt-2 text-sm text-zinc-400">
          AI-powered research workspace
        </p>

      </div>

      {/* New Chat */}
      <div className="mt-8">

        <button
          onClick={handleNewChat}
          className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black transition hover:bg-zinc-200"
        >
          + New Chat
        </button>

      </div>

      {/* Upload */}
      <div className="mt-6">

        <UploadBox />

      </div>

      {/* Documents */}
      <div className="mt-8">

        <p className="mb-3 text-xs uppercase tracking-wide text-zinc-500">
          Documents
        </p>

        {/* Search */}
        <div className="mb-3">

          <input
            type="text"
            placeholder="Search documents..."
            value={documentSearch}
            onChange={(e) =>
              setDocumentSearch(
                e.target.value
              )
            }
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm outline-none"
          />

        </div>

        {/* Sort */}
        <div className="mb-4">

          <select
            value={sortOption}
            onChange={(e) =>
              setSortOption(
                e.target.value
              )
            }
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm outline-none"
          >

            <option value="latest">
              Latest Upload
            </option>

            <option value="a-z">
              A-Z
            </option>

            <option value="z-a">
              Z-A
            </option>

          </select>

        </div>

        {/* Documents List */}
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">

          {filteredDocuments.map((doc) => (

            <div
              key={doc}
              onClick={() =>
                setSelectedDocument(doc)
              }
              className={`flex cursor-pointer items-center justify-between rounded-xl p-3 text-sm transition ${
                selectedDocument === doc
                  ? "bg-white text-black"
                  : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
              }`}
            >

              <span className="truncate">
                {doc}
              </span>

              <button
                onClick={async (e) => {

                  e.stopPropagation();

                  const confirmed =
                    window.confirm(
                      "Delete this document?"
                    );

                  if (!confirmed) {
                    return;
                  }

                  try {

                    await fetch(
                      `${process.env.NEXT_PUBLIC_API_URL}/documents/${doc}`,
                      {
                        method: "DELETE",
                      }
                    );

                    window.location.reload();

                  } catch (error) {

                    console.error(error);

                  }

                }}
                className="ml-3 text-xs text-zinc-500 transition hover:text-red-400"
              >
                ✕
              </button>

            </div>

          ))}

        </div>

      </div>

      {/* Chat Sessions */}
      <div className="mt-8 flex-1 space-y-2 overflow-y-auto">

        {sessions.map((session) => (

          <div
            key={session.id}
            className={`flex items-center justify-between rounded-xl p-3 text-sm transition ${
              activeSessionId ===
              session.id
                ? "bg-zinc-800 text-white"
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
            }`}
          >

            {/* Session Area */}
            <div
              onClick={() =>
                setActiveSessionId(
                  session.id
                )
              }
              className="flex flex-1 cursor-pointer items-center"
            >

              <input
                value={session.title}
                onClick={(e) =>
                  e.stopPropagation()
                }
                onChange={(e) => {

                  setSessions((prev) =>
                    prev.map((s) =>

                      s.id ===
                      session.id
                        ? {
                            ...s,
                            title:
                              e.target.value,
                          }
                        : s
                    )
                  );

                }}
                className="w-full truncate bg-transparent outline-none"
              />

            </div>

            {/* Delete */}
            <button
              onClick={() => {

                const confirmed =
                  window.confirm(
                    "Delete this chat?"
                  );

                if (!confirmed) {
                  return;
                }

                const remaining =
                  sessions.filter(
                    (s) =>
                      s.id !== session.id
                  );

                setSessions(
                  remaining
                );

                if (
                  activeSessionId ===
                  session.id
                ) {

                  if (
                    remaining.length > 0
                  ) {

                    setActiveSessionId(
                      remaining[0].id
                    );

                  } else {

                    setActiveSessionId(
                      null
                    );

                  }

                }

              }}
              className="ml-3 text-xs text-zinc-500 transition hover:text-red-400"
            >
              ✕
            </button>

          </div>

        ))}

      </div>

    </div>
  );
}