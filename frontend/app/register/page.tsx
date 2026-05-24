"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Registration is now handled through the OTP flow on the login page.
// New users are automatically detected and prompted to set a password.
export default function RegisterPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/login"); }, [router]);
  return null;
}
