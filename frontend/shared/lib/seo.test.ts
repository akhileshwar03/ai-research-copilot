import { describe, expect, it } from "vitest";

import { pageMetadata } from "./seo";

describe("pageMetadata", () => {
  it("gives each page its own canonical and og:url, never the homepage's", () => {
    const m = pageMetadata({ title: "T", description: "D", path: "/privacy" });
    expect(m.alternates?.canonical).toBe("/privacy");
    expect((m.openGraph as { url?: string }).url).toBe("/privacy");
  });

  it("repeats siteName/type because a child's openGraph replaces the root's", () => {
    const m = pageMetadata({ title: "T", description: "D", path: "/chat" });
    expect(m.openGraph).toMatchObject({ siteName: "Querex", type: "website", title: "T", description: "D" });
  });
});
