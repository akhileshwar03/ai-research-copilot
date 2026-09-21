"use client";

import { useAppConfig } from "@/features/shared/hooks/use-app-config";

/** The two footer bits that depend on admin-set config (Settings → Legal &
 *  contact) — kept as small client components so the landing page itself
 *  can stay a server component, same pattern as GithubNavLink. */

export function SupportEmailLink({ className }: { className: string }) {
  const { config } = useAppConfig();
  if (!config.support_email) return null;
  return (
    <a href={`mailto:${config.support_email}`} className={className}>
      Contact
    </a>
  );
}

export function FooterCopyright() {
  const { config } = useAppConfig();
  return (
    <span>
      © {new Date().getFullYear()} {config.legal_entity_name}. All rights reserved.
    </span>
  );
}
