"use client";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-black p-8 text-white">
        <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-zinc-400">{error.message || "Unexpected application error."}</p>
          <button className="mt-5 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black" onClick={reset}>
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}
