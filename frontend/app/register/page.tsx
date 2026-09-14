"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// There's no separate registration step: the login page's email-OTP flow
// creates a new account automatically the first time an email verifies, and
// OAuth (Google/GitHub) does the same. This route only exists to catch old
// bookmarks/links and send them to the one real entry point.
export default function RegisterPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/login"); }, [router]);
  return null;
}
