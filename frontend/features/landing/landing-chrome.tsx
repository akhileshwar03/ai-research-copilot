import Link from "next/link";

import { NavProfileMenu } from "@/features/auth/components/nav-profile-menu";
import { GithubNavLink } from "@/features/landing/github-nav-link";
import { FooterCopyright, FooterStatusList, SupportEmailLink } from "@/features/landing/footer-dynamic";
import { PRODUCTS } from "@/features/landing/products";
import { BrandMark } from "@/features/shared/components/brand-mark";

/** Sticky frosted nav shared by the homepage and the per-tool landing pages. `active` highlights a tool. */
export function LandingNav({ active }: { active?: string }) {
  return (
<nav className="glass-bar sticky top-0 z-40 border-b">
  <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
    <Link href="/" className="flex items-center gap-2.5">
      <BrandMark />
      <span className="font-headline text-[15px] font-bold tracking-tight">Querex</span>
    </Link>
    <div className="hidden items-center gap-1 md:flex">
      {PRODUCTS.map((product) => (
        <Link
          key={product.name}
          href={product.href}
          aria-current={active === product.name ? "page" : undefined}
              className={[
                "group flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition hover:text-zinc-900",
                active === product.name ? "text-zinc-900" : "text-zinc-500",
              ].join(" ")}
        >
          <span
            className="h-1.5 w-1.5 rounded-full opacity-70 transition group-hover:opacity-100"
            style={{ backgroundColor: product.accent }}
          />
          {product.name}
        </Link>
      ))}
    </div>
    <div className="flex items-center gap-2">
      <GithubNavLink className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-zinc-500 transition hover:text-zinc-900" />
      <NavProfileMenu />
    </div>
  </div>
</nav>
  );
}

/** The homepage footer, shared with the per-tool landing pages. */
export function LandingFooter() {
  return (
<footer className="glass-bar border-t">
  <div className="mx-auto max-w-7xl px-6 pt-14">
    <div className="grid grid-cols-1 gap-12 pb-12 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr_0.9fr]">
      {/* Brand */}
      <div>
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-headline text-[15px] font-bold tracking-tight text-zinc-900">Querex</span>
        </div>
        <p className="mt-4 max-w-xs text-[13.5px] leading-6 text-zinc-500">
          One account, five AI tools for research and writing — grounded answers,
          honest detection, and formatting you can verify, not just trust.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <GithubNavLink className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900" />
          <SupportEmailLink className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900" />
        </div>
      </div>

      {/* Products */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Products</p>
        <ul className="mt-4 space-y-2.5">
          {PRODUCTS.map((product) => (
            <li key={product.name}>
              <Link
                href={product.href}
                className="group flex items-center gap-2 text-[13.5px] text-zinc-600 transition hover:text-zinc-900"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full opacity-70 transition group-hover:opacity-100"
                  style={{ backgroundColor: product.accent }}
                />
                {product.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Account */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Account</p>
        <ul className="mt-4 space-y-2.5 text-[13.5px] text-zinc-600">
          <li>
            <Link href="/chat" className="transition hover:text-zinc-900">
              Open workspace
            </Link>
          </li>
          <li>
            <Link href="/register" className="transition hover:text-zinc-900">
              Create account
            </Link>
          </li>
          <li>
            <Link href="/login" className="transition hover:text-zinc-900">
              Sign in
            </Link>
          </li>
        </ul>
      </div>

      {/* Legal */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Legal</p>
        <ul className="mt-4 space-y-2.5 text-[13.5px] text-zinc-600">
          <li>
            <Link href="/privacy" className="transition hover:text-zinc-900">
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link href="/terms" className="transition hover:text-zinc-900">
              Terms of Service
            </Link>
          </li>
        </ul>
      </div>

      {/* Status */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</p>
        <FooterStatusList products={PRODUCTS} />
      </div>
    </div>

    <div className="flex flex-col items-center justify-between gap-4 border-t border-zinc-200/70 py-6 text-[12.5px] text-zinc-500 md:flex-row">
      <FooterCopyright />
      <span className="flex items-center gap-1.5 text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        All systems operational
      </span>
    </div>
  </div>
</footer>
  );
}
