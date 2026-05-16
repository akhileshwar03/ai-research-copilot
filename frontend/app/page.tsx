export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="flex">
        
        {/* Sidebar */}
        <aside className="w-72 border-r border-zinc-800 p-4">
          <h1 className="text-2xl font-bold">
            AI Research Copilot
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Advanced AI-powered research workspace
          </p>
        </aside>

        {/* Main Content */}
        <section className="flex-1 p-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-3xl font-semibold">
              Welcome
            </h2>

            <p className="mt-4 text-zinc-400">
              Your AI-powered research assistant is being built.
            </p>
          </div>
        </section>

      </div>
    </main>
  );
}