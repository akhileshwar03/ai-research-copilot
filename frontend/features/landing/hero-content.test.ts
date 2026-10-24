import { describe, expect, it } from "vitest";

import { HERO_CHIPS, HERO_SUBHEAD, PRODUCT_NAMES, SHOWS_ITS_WORK } from "./hero-content";

describe("homepage hero content", () => {
  it("has two chips for every product, so no tab can render an empty preview", () => {
    for (const name of PRODUCT_NAMES) {
      expect(HERO_CHIPS[name], name).toHaveLength(2);
    }
  });

  it("states one verifiable fact per tool, in navigation order", () => {
    expect(SHOWS_ITS_WORK.map((x) => x.tool)).toEqual(PRODUCT_NAMES);
    for (const x of SHOWS_ITS_WORK) expect(x.fact.length).toBeGreaterThan(15);
  });

  it("names every tool's job in the subheadline and never invents social proof", () => {
    const text = HERO_SUBHEAD.toLowerCase();
    for (const job of ["ask your documents", "rewrite", "detect", "live web", "formatting"]) {
      expect(text).toContain(job);
    }
    for (const banned of ["trusted by", "million", "thousands of", "#1", "best-in-class"]) {
      expect(text).not.toContain(banned);
    }
  });
});
