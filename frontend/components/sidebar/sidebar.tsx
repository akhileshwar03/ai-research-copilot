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

        <div className="space-y-2">

          {documents.map((doc) => (

            <button
              key={doc}
              onClick={() =>
                setSelectedDocument(doc)
              }
              className={`w-full rounded-xl p-3 text-left text-sm transition ${
                selectedDocument === doc
                  ? "bg-white text-black"
                  : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {doc}
            </button>

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