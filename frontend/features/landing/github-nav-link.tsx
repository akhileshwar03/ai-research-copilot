"use client";

import { useAppConfig } from "@/features/shared/hooks/use-app-config";

/**
 * The landing page's outbound link to the source repo — admin-toggleable
 * (github_link_enabled) and admin-repointable (github_repo_url) so showing
 * a personal/private repo to every visitor isn't a hardcoded, code-deploy-
 * only decision. Renders nothing while off or if no URL is configured.
 */
export function GithubNavLink({ className }: { className: string }) {
  const { config } = useAppConfig();
  if (!config.github_link_enabled || !config.github_repo_url) return null;

  return (
    <a href={config.github_repo_url} target="_blank" rel="noopener noreferrer" className={className}>
      GitHub
    </a>
  );
}
