import { pageMetadata } from "@/shared/lib/seo";

export const metadata = pageMetadata({
  title: "Real-time AI — Answers from a live web search | Querex",
  description: "Ask anything and get an answer grounded in a live web search, with numbered sources you can open.",
  path: "/realtime",
  noindex: true,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
