import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.querex.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/chat", "/humanizer", "/checker", "/realtime", "/paper-analyzer", "/privacy", "/terms"];
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
  }));
}
