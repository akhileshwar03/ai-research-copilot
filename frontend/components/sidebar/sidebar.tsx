import UploadBox from "../upload/upload-box";
export default function Sidebar() {
  return (
    <div className="flex h-full flex-col p-4">

      <div>
        <h1 className="text-2xl font-bold">
          AI Research Copilot
        </h1>

        <p className="mt-2 text-sm text-zinc-400">
          AI-powered research workspace
        </p>
      </div>

      <div className="mt-8">
        <button className="w-full rounded-xl bg-white px-4 py-3 text-black font-medium">
          + New Chat
        </button>
      </div>

      <div className="mt-6">
        <UploadBox />
      </div>

      <div className="mt-8 flex-1">
        <p className="text-sm text-zinc-500">
          No conversations yet
        </p>
      </div>

    </div>
  );
}