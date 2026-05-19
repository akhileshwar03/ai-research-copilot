import Link from "next/link";

export default function LandingPage() {

  return (
    <main className="min-h-screen bg-black text-white">

      {/* Hero */}
      <section className="mx-auto flex max-w-7xl flex-col items-center px-6 py-32 text-center">

        <div className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-400">
          AI-Powered Research Intelligence Platform
        </div>

        <h1 className="mt-8 max-w-5xl text-6xl font-bold leading-tight tracking-tight">

          Transform Documents Into
          Intelligent Conversations

        </h1>

        <p className="mt-8 max-w-2xl text-lg leading-8 text-zinc-400">

          Upload PDFs, retrieve contextual insights,
          analyze research papers, and interact with
          documents using advanced Retrieval-Augmented
          Generation pipelines.

        </p>

        <div className="mt-12 flex items-center gap-4">

          <Link
            href="/chat"
            className="rounded-2xl bg-white px-8 py-4 font-medium text-black transition hover:bg-zinc-200"
          >
            Launch Application
          </Link>

          <a
            href="https://github.com"
            target="_blank"
            className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-4 font-medium text-white transition hover:bg-zinc-900"
          >
            GitHub
          </a>

        </div>

      </section>

      {/* Features */}
      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-32 md:grid-cols-3">

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">

          <h3 className="text-2xl font-semibold">
            Retrieval-Augmented Generation
          </h3>

          <p className="mt-4 leading-7 text-zinc-400">
            Semantic document retrieval using embeddings,
            vector databases, and contextual grounding.
          </p>

        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">

          <h3 className="text-2xl font-semibold">
            Streaming AI Responses
          </h3>

          <p className="mt-4 leading-7 text-zinc-400">
            Real-time token streaming architecture
            delivering modern conversational UX.
          </p>

        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">

          <h3 className="text-2xl font-semibold">
            Multi-Session Research Workspace
          </h3>

          <p className="mt-4 leading-7 text-zinc-400">
            Persistent AI chat sessions with document-aware
            conversational memory and contextual continuity.
          </p>

        </div>

      </section>

    </main>
  );
}