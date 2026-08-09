"use client";

import Link from "next/link";

import { useAuth } from "@/features/auth/hooks/use-auth";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PRODUCTS = [
  { href: "/chat", label: "Research Copilot" },
  { href: "/humanizer", label: "Humaniser" },
  { href: "/checker", label: "AI Checker" },
  { href: "/realtime", label: "Real-time AI" },
];

export function NavProfileMenu() {
  const { isReady, isAuthenticated, email, logout } = useAuth();

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

  const initial = email ? email[0].toUpperCase() : "?";

  return (
    <DropdownMenuRoot>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-[13px] font-medium text-zinc-800 shadow-sm transition hover:border-black/[0.14]">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white">
            {initial}
          </span>
          <span className="hidden max-w-[140px] truncate sm:inline">{email}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Products</DropdownMenuLabel>
        {PRODUCTS.map((product) => (
          <DropdownMenuItem key={product.href} asChild>
            <Link href={product.href}>{product.label}</Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onClick={logout}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}
