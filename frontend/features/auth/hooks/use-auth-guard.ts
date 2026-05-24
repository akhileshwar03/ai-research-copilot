"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/stores/auth-store";

export function useAuthGuard() {
  const router = useRouter();
  const isReady = useAuthStore((s) => s.isReady);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const email = useAuthStore((s) => s.email);

  useEffect(() => {
    if (isReady && (!isAuthenticated || !email)) {
      router.replace("/login");
    }
  }, [isReady, isAuthenticated, email, router]);

  return { isReady, isAuthenticated: Boolean(isAuthenticated && email) };
}
