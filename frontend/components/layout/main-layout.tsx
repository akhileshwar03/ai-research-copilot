export default function MainLayout({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen bg-black text-white">
      <aside className="w-72 border-r border-zinc-800 bg-zinc-950">
        {sidebar}
      </aside>

      <section className="flex-1 overflow-hidden">
        {children}
      </section>
    </main>
  );
}