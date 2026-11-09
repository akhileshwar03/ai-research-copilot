import { TOOL_PAGES } from "@/features/landing/tool-pages";
import { pageMetadata } from "@/shared/lib/seo";

export const metadata = pageMetadata({
  title: "AI Checker — Detect AI-generated text | Querex",
  description: "Check whether text was written by AI, with a probability score, sentence-level highlights and the signals behind the verdict.",
  path: "/checker",
});

const page = TOOL_PAGES.checker;

// Describes what is on the page, nothing more: the same questions and answers the visitor can open, and a free web app.
const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Querex AI Checker",
    url: "https://www.querex.app/checker",
    description: page.intro,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      {children}
    </>
  );
}
