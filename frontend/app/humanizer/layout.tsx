import { pageMetadata } from "@/shared/lib/seo";

export const metadata = pageMetadata({
  title: "Humanizer — Rewrite AI-sounding text | Querex",
  description: "Rewrite AI-sounding text with two engines: Basic, a prompt-engineered pipeline, and Ultra, a purpose-trained model (rolling out). A word-level diff shows exactly what changed.",
  path: "/humanizer",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
