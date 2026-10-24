"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/stores/auth-store";

/**
 * `redirect: false` is for pages that show a public view to signed-out visitors (and crawlers) instead
 * of bouncing them to /login -- see features/landing/tool-landing.tsx.
 */
export function useAuthGuard({ redirect = true }: { redirect?: boolean } = {}) {
  const router = useRouter();
  const isReady = useAuthStore((s) => s.isReady);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const email = useAuthStore((s) => s.email);

  useEffect(() => {
    if (redirect && isReady && (!isAuthenticated || !email)) {
      router.replace("/login");
    }
  }, [redirect, isReady, isAuthenticated, email, router]);

  return { isReady, isAuthenticated: Boolean(isAuthenticated && email) };
}
