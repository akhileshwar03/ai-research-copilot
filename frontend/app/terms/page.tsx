import { pageMetadata } from "@/shared/lib/seo";
import { LegalPage } from "@/features/landing/legal-page";

export const metadata = pageMetadata({
  title: "Terms of Service — Querex",
  description: "The terms that apply when you use Querex.",
  path: "/terms",
});

export default function TermsPage() {
  return <LegalPage title="Terms of Service" endpoint="/app/legal/terms" />;
}
