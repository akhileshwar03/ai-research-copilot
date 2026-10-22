import type { Metadata } from "next";

/**
 * Per-page metadata with a canonical URL of its own.
 *
 * The root layout used to set `alternates.canonical: "/"` for the whole site, and Next passes that
 * down to every page that doesn't override it -- so /privacy, /terms and all five tool pages told
 * Google "my canonical URL is the homepage", and Search Console excluded them as duplicates
 * (found 2026-10-22). Every indexable page must go through this helper (or set its own canonical).
 *
 * `openGraph` is replaced, not merged, by a child segment, so the fields the root sets are repeated.
 */
export function pageMetadata({
  title,
  description,
  path,
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  /** For login-gated app screens: signed-out crawlers are redirected to /login, so they can't be indexed. */
  noindex?: boolean;
}): Metadata {
  return {
    title,
    description,
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "Querex", title, description, url: path },
    twitter: { card: "summary", title, description },
  };
}
