import { describe, expect, it } from "vitest";

import { PRODUCTS } from "./products";
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

  it("maps each page to a real product (accent colour and live demo depend on it)", () => {
    for (const p of pages) {
      const product = PRODUCTS.find((x) => x.name === p.name);
      expect(product, p.name).toBeDefined();
      expect(product?.href).toBe(p.path);
    }
  });

  it("splits the h1 into headline parts without changing its text", () => {
    for (const p of pages) {
      expect(`${p.headline.lead} ${p.headline.emphasis}`).toBe(p.h1);
      expect(p.chips).toHaveLength(2);
      expect(p.features.bullets.length).toBeGreaterThanOrEqual(3);
      expect(p.cta.title.length).toBeGreaterThan(5);
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
