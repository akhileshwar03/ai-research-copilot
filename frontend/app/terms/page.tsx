import { LegalPage } from "@/features/landing/legal-page";

export const metadata = { title: "Terms of Service — Querex" };

export default function TermsPage() {
  return <LegalPage title="Terms of Service" endpoint="/app/legal/terms" />;
}
