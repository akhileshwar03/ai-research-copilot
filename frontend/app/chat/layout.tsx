import { pageMetadata } from "@/shared/lib/seo";

export const metadata = pageMetadata({
  title: "Research Copilot — Chat with your PDFs | Querex",
  description: "Upload research papers and reports, then ask questions and get streamed answers with page-level citations you can verify.",
  path: "/chat",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
