"use client";

export default function ChatError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-screen items-center justify-center bg-black p-8 text-white">
      <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <h2 className="text-xl font-semibold">Workspace Error</h2>
        <p className="mt-2 text-sm text-zinc-400">{error.message}</p>
        <button className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black" onClick={reset}>
          Retry
        </button>
      </div>
    </div>
  );
}
