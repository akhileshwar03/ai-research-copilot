import { pageMetadata } from "@/shared/lib/seo";

export const metadata = pageMetadata({
  title: "AI Checker — Detect AI-generated text | Querex",
  description: "Check whether text was written by AI, with a probability score, sentence-level highlights and the signals behind the verdict.",
  path: "/checker",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
