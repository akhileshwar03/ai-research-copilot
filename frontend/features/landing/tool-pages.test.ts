import { describe, expect, it } from "vitest";

import { TOOL_PAGES } from "./tool-pages";

describe("public tool landing content", () => {
  const pages = Object.values(TOOL_PAGES);

  it("covers the three flagship tools, each at its own route", () => {
    expect(pages.map((p) => p.path).sort()).toEqual(["/chat", "/checker", "/humanizer"]);
    for (const [slug, p] of Object.entries(TOOL_PAGES)) expect(p.slug).toBe(slug);
  });

  it("has real, non-empty content for a crawler to read", () => {
    for (const p of pages) {
      expect(p.h1.length).toBeGreaterThan(20);
      expect(p.intro.length).toBeGreaterThan(80);
      expect(p.steps.length).toBeGreaterThanOrEqual(3);
      expect(p.example.items.length).toBeGreaterThanOrEqual(2);
      expect(p.faq.length).toBeGreaterThanOrEqual(2);
      expect(p.goodToKnow.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("never promises to beat AI detectors or guarantees accuracy", () => {
    const text = JSON.stringify(TOOL_PAGES).toLowerCase();
    for (const banned of ["undetectable", "100% accurate", "bypass", "guarantee"]) {
      // "does not promise ..." wording is allowed; a positive claim is not.
      expect(text.includes(banned) && !text.includes("not promise")).toBe(false);
    }
  });
});
