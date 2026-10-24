"use client";

import Link from "next/link";

import { useAuthStore } from "@/stores/auth-store";

/**
 * The homepage's primary call to action. The label says what happens next (NN/g: "a link is a promise"):
 * signed-out visitors are offered the tools, signed-in users are taken straight to their workspace.
 */
export function HeroCta({ className }: { className: string }) {
  const isReady = useAuthStore((s) => s.isReady);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const signedIn = isReady && isAuthenticated;

  return (
    <Link href={signedIn ? "/chat" : "/login"} className={className}>
      {signedIn ? "Open workspace" : "Try the tools free"}
    </Link>
  );
}
