import { pageMetadata } from "@/shared/lib/seo";

export const metadata = pageMetadata({
  title: "Paper Analyzer — Check APA, MLA and IEEE formatting | Querex",
  description: "Measure your paper's real margins, spacing, font and alignment against APA, MLA or IEEE.",
  path: "/paper-analyzer",
  noindex: true,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
