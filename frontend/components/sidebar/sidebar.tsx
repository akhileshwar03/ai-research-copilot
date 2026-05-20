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
  fetchDocuments,

}: {
  sessions: ChatSession[];

  activeSessionId:
    number | null;

  setActiveSessionId:
    React.Dispatch<
      React.SetStateAction<
        number | null
      >
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

  fetchDocuments:
    () => Promise<void>;
}) {

  const [showDocMenu,
    setShowDocMenu] =
    useState(false);

  const [showSearch,
    setShowSearch] =
    useState(false);

  const [selectMode,
    setSelectMode] =
    useState(false);

  const [selectedDocs,
    setSelectedDocs] =
    useState<string[]>([]);

  const [editingChatId,
    setEditingChatId] =
    useState<number | null>(
      null
    );

  const [editingTitle,
    setEditingTitle] =
    useState("");

  const [openChatMenuId,
    setOpenChatMenuId] =
    useState<number | null>(
      null
    );

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

      pinned: false,

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

        {/* Header */}
        <div className="mb-3 flex items-center justify-between">

          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Documents
          </p>

          <div className="relative">

            <button
              onClick={() =>
                setShowDocMenu(
                  !showDocMenu
                )
              }
              className="text-zinc-500 hover:text-white"
            >
              ⋯
            </button>

            {showDocMenu && (

              <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-zinc-800 bg-zinc-950 p-2 shadow-xl">

                <button
                  onClick={() => {

                    setShowSearch(
                      true
                    );

                    setSelectMode(
                      false
                    );

                    setShowDocMenu(
                      false
                    );

                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-900"
                >
                  Search
                </button>

                <button
                  onClick={() => {

                    setSortOption(
                      "a-z"
                    );

                    setShowSearch(
                      false
                    );

                    setSelectMode(
                      false
                    );

                    setShowDocMenu(
                      false
                    );

                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-900"
                >
                  Sort A-Z
                </button>

                <button
                  onClick={() => {

                    setSortOption(
                      "z-a"
                    );

                    setShowSearch(
                      false
                    );

                    setSelectMode(
                      false
                    );

                    setShowDocMenu(
                      false
                    );

                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-900"
                >
                  Sort Z-A
                </button>

                <button
                  onClick={() => {

                    setSortOption(
                      "latest"
                    );

                    setShowSearch(
                      false
                    );

                    setSelectMode(
                      false
                    );

                    setShowDocMenu(
                      false
                    );

                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-900"
                >
                  Latest Upload
                </button>

                <button
                  onClick={() => {

                    setSelectMode(
                      true
                    );

                    setShowSearch(
                      false
                    );

                    setShowDocMenu(
                      false
                    );

                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-900"
                >
                  Select Documents
                </button>

              </div>

            )}

          </div>

        </div>

        {/* Search */}
        {showSearch && (

          <div className="mb-3">

            <input
              autoFocus
              type="text"
              placeholder="Search documents..."
              value={documentSearch}
              onChange={(e) =>
                setDocumentSearch(
                  e.target.value
                )
              }
              onBlur={() => {

                setShowSearch(
                  false
                );

              }}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm outline-none"
            />

          </div>

        )}

        {/* Floating Delete */}
        {selectMode &&
          selectedDocs.length > 0 && (

          <div className="mb-3 flex justify-end">

            <button
              onClick={async () => {

                const confirmed =
                  window.confirm(
                    `Delete ${selectedDocs.length} documents?`
                  );

                if (!confirmed) {
                  return;
                }

                try {

                  await Promise.all(

                    selectedDocs.map(
                      (doc) =>

                        fetch(
                          `${process.env.NEXT_PUBLIC_API_URL}/documents/${doc}`,
                          {
                            method: "DELETE",
                          }
                        )
                    )
                  );

                  await fetchDocuments();

                  setSelectedDocs([]);

                  setSelectMode(
                    false
                  );

                } catch (error) {

                  console.error(error);

                }

              }}
              className="rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white hover:bg-red-600"
            >
              Delete
            </button>

          </div>

        )}

        {/* Documents */}
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">

          {filteredDocuments.map((doc) => (

            <div
              key={doc}
              onClick={() => {

                if (selectMode) {

                  setSelectedDocs(
                    (prev) =>

                      prev.includes(doc)
                        ? prev.filter(
                            (d) =>
                              d !== doc
                          )
                        : [...prev, doc]
                  );

                  return;
                }

                setSelectedDocument(
                  doc
                );

                setShowSearch(
                  false
                );

                setSelectMode(
                  false
                );

              }}
              className={`flex cursor-pointer items-center justify-between rounded-xl p-3 text-sm transition ${
                selectedDocument === doc
                  ? "bg-white text-black"
                  : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
              } ${
                selectedDocs.includes(doc)
                  ? "ring-2 ring-white"
                  : ""
              }`}
            >

              <span className="truncate">
                {doc}
              </span>

            </div>

          ))}

        </div>

      </div>

      {/* Chats */}
      <div className="mt-8 flex-1 space-y-2 overflow-y-auto">

        {[...sessions]

          .sort((a, b) => {

            if (
              a.pinned &&
              !b.pinned
            ) {
              return -1;
            }

            if (
              !a.pinned &&
              b.pinned
            ) {
              return 1;
            }

            return 0;

          })

          .map((session) => (

          <div
            key={session.id}
            className={`flex items-center justify-between rounded-xl p-3 text-sm transition ${
              activeSessionId ===
              session.id
                ? "bg-zinc-800 text-white"
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
            }`}
          >

            {/* Open Chat */}
            <div
              onClick={() => {

                setActiveSessionId(
                  session.id
                );

                setShowSearch(
                  false
                );

                setSelectMode(
                  false
                );

              }}
              className="flex flex-1 cursor-pointer items-center"
            >

              {editingChatId ===
              session.id ? (

                <input
                  autoFocus
                  value={editingTitle}
                  onChange={(e) =>
                    setEditingTitle(
                      e.target.value
                    )
                  }
                  onBlur={() => {

                    setSessions((prev) =>
                      prev.map((s) =>

                        s.id ===
                        session.id
                          ? {
                              ...s,
                              title:
                                editingTitle,
                            }
                          : s
                      )
                    );

                    setEditingChatId(
                      null
                    );

                  }}
                  className="w-full bg-transparent outline-none"
                />

              ) : (

                <span className="truncate">
                  {session.pinned
                    ? "📌 "
                    : ""}
                  {session.title}
                </span>

              )}

            </div>

            {/* Menu */}
            <div className="relative">

              <button
                onClick={(e) => {

                  e.stopPropagation();

                  setOpenChatMenuId(

                    openChatMenuId ===
                    session.id
                      ? null
                      : session.id
                  );

                }}
                className="ml-2 text-xs text-zinc-500 hover:text-white"
              >
                ⋯
              </button>

              {openChatMenuId ===
                session.id && (

                <div className="absolute right-0 z-50 mt-2 w-40 rounded-xl border border-zinc-800 bg-zinc-950 p-2 shadow-xl">

                  <button
                    onClick={() => {

                      setEditingChatId(
                        session.id
                      );

                      setEditingTitle(
                        session.title
                      );

                      setOpenChatMenuId(
                        null
                      );

                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-900"
                  >
                    Rename
                  </button>

                  <button
                    onClick={() => {

                      setSessions((prev) =>

                        prev.map((s) =>

                          s.id ===
                          session.id
                            ? {
                                ...s,
                                pinned:
                                  !s.pinned,
                              }
                            : s
                        )
                      );

                      setOpenChatMenuId(
                        null
                      );

                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-900"
                  >
                    {session.pinned
                      ? "Unpin"
                      : "Pin"}
                  </button>

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

                      setOpenChatMenuId(
                        null
                      );

                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-zinc-900"
                  >
                    Delete
                  </button>

                </div>

              )}

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}