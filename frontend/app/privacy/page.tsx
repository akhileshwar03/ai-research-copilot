import { LegalPage } from "@/features/landing/legal-page";

export const metadata = { title: "Privacy Policy — Querex" };

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" endpoint="/app/legal/privacy" />;
}
