import { pageMetadata } from "@/shared/lib/seo";

export const metadata = pageMetadata({
  title: "Humanizer — Rewrite AI-sounding text | Querex",
  description: "Rewrite AI-sounding text so it reads naturally, with a diff view that shows exactly what changed.",
  path: "/humanizer",
  noindex: true,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
