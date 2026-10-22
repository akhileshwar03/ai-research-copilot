import { pageMetadata } from "@/shared/lib/seo";
import { LegalPage } from "@/features/landing/legal-page";

export const metadata = pageMetadata({
  title: "Privacy Policy — Querex",
  description: "How Querex handles your data, documents and account.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" endpoint="/app/legal/privacy" />;
}
