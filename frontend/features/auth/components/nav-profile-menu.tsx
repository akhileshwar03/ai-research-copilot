"use client";

import Link from "next/link";

import { WorkspaceProfileFooter } from "@/components/layout/workspace-profile-footer";
import { useAuth } from "@/features/auth/hooks/use-auth";

/**
 * The landing page's own account control — previously a separate, bespoke
 * dropdown (a "Products" list + Sign out) that looked and behaved nothing
 * like the one signed-in users see everywhere else in the app. Now just
 * delegates to the same WorkspaceProfileFooter the tool pages use once
 * authenticated, so there's exactly one account-menu design in the product,
 * not two that can drift apart. The "not ready" / "not authenticated" cases
 * stay here since WorkspaceProfileFooter assumes an authenticated user.
 */
export function NavProfileMenu() {
  const { isReady, isAuthenticated } = useAuth();

  if (!isReady) {
    // Reserve the same footprint as the "Sign in" button to avoid layout shift.
    return <div className="h-9 w-[84px]" aria-hidden />;
  }

  if (!isAuthenticated) {
    return (
      <Link
        href="/login"
        className="rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white shadow-md shadow-zinc-900/20 transition hover:bg-zinc-700"
      >
        Sign in
      </Link>
    );
  }

  return <WorkspaceProfileFooter />;
}
