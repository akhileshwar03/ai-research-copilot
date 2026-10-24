import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.querex.app";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only pages a signed-out crawler can actually read. /chat, /humanizer and /checker show a public
  // landing view to signed-out visitors (features/landing/tool-landing.tsx). /realtime and
  // /paper-analyzer still redirect them to /login, which Search Console reports as "Page with
  // redirect", so those two stay out of the sitemap and are marked noindex.
  const routes = ["", "/chat", "/humanizer", "/checker", "/privacy", "/terms"];
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
  }));
}
