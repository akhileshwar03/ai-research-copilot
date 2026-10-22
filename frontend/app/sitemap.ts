import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.querex.app";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only pages a signed-out crawler can actually read. The five tool pages redirect signed-out
  // visitors to /login (useAuthGuard), which Search Console reports as "Page with redirect", so
  // they stay out of the sitemap and are marked noindex.
  const routes = ["", "/privacy", "/terms"];
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
  }));
}
