import { describe, expect, it } from "vitest";

import { countWords, formatFileSize, presentVerdict, splitOf, trimToLimit } from "@/features/checker/verdict";
import type { CheckResult } from "@/services/api/checker-api";

const result = (over: Partial<CheckResult>): CheckResult => ({
  verdict: "likely_ai",
  ai_score: 0.97,
  mixed_probability: 0.02,
  word_count: 100,
  sentences: [],
  disclaimer: "",
  ...over,
});

describe("trimToLimit", () => {
  it("keeps text that already fits", () => {
    expect(trimToLimit("One. Two.", 50)).toBe("One. Two.");
  });
  it("ends at the last full sentence inside the limit", () => {
    expect(trimToLimit("First sentence. Second sentence. Third sentence.", 35)).toBe("First sentence. Second sentence.");
  });
  it("cuts hard when there is no sentence end to stop at", () => {
    expect(trimToLimit("a very long run of words without any full stop at all", 10)).toBe("a very lon");
  });
});

describe("countWords", () => {
  it("counts words the way the backend does", () => {
    expect(countWords("It's a test, with 3 parts.")).toBe(6);
    expect(countWords("")).toBe(0);
  });
});

describe("formatFileSize", () => {
  it("shows KB for small files and MB for large ones", () => {
    expect(formatFileSize(1256)).toBe("1 KB");
    expect(formatFileSize(300)).toBe("1 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("presentVerdict", () => {
  it("says AI when the AI share leads", () => {
    expect(presentVerdict(result({ ai_score: 0.97, mixed_probability: 0.02 })).label).toBe("Likely AI");
  });
  it("says mixed when the model's top answer is a human + AI mix", () => {
    expect(presentVerdict(result({ ai_score: 0.97, mixed_probability: 0.95 })).label).toBe("Likely mixed");
  });
  it("keeps the verdict's own wording for human and unsure", () => {
    expect(presentVerdict(result({ verdict: "likely_human", ai_score: 0.1 })).label).toBe("Likely human");
    expect(presentVerdict(result({ verdict: "uncertain", ai_score: 0.6, mixed_probability: 0.1 })).label).toBe("Unsure");
  });
  it("calls an unsure result mixed when the model's top answer is a mix", () => {
    // Human 4%, Mixed 81%, AI 15%: the model's top answer is the mix, so "Unsure" would contradict its own bar.
    const r = presentVerdict(result({ verdict: "uncertain", ai_score: 0.96, mixed_probability: 0.81 }));
    expect(r.label).toBe("Likely mixed");
    expect(r.detail).toContain("edited");
  });
  it("keeps a likely-human result human even if the mix share is larger than the AI share", () => {
    expect(presentVerdict(result({ verdict: "likely_human", ai_score: 0.3, mixed_probability: 0.2 })).label).toBe("Likely human");
  });
  it("says which way a plain unsure leans", () => {
    expect(presentVerdict(result({ verdict: "uncertain", ai_score: 0.93, mixed_probability: 0.03, word_count: 400 })).headline).toContain("leans towards AI");
    expect(presentVerdict(result({ verdict: "uncertain", ai_score: 0.45, mixed_probability: 0.1, word_count: 400 })).headline).toContain("leans towards human");
  });
  it("only suggests a longer sample for short texts", () => {
    const long = presentVerdict(result({ verdict: "uncertain", ai_score: 0.93, mixed_probability: 0.03, word_count: 400 }));
    expect(long.detail).not.toContain("longer sample");
    const short = presentVerdict(result({ verdict: "uncertain", ai_score: 0.93, mixed_probability: 0.03, word_count: 80 }));
    expect(short.detail).toContain("longer sample");
  });
});

describe("splitOf", () => {
  it("splits the estimate into human, mixed and AI-only shares that add up", () => {
    const s = splitOf(result({ ai_score: 0.9, mixed_probability: 0.3 }));
    expect(s.human).toBeCloseTo(0.1);
    expect(s.mixed).toBeCloseTo(0.3);
    expect(s.ai).toBeCloseTo(0.6);
    expect(s.human + s.mixed + s.ai).toBeCloseTo(1);
  });
});
