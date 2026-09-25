import { describe, expect, it } from "vitest";
import {
  calculateComparisonPeriod,
  calculateDelta,
  formatRangeLabel,
  formatYMD,
  getPresetDateRange,
  parseYMD,
} from "./date-range-utils";

describe("date-range-utils", () => {
  it("formats Date to YYYY-MM-DD in UTC", () => {
    const d = new Date(Date.UTC(2026, 8, 25));
    expect(formatYMD(d)).toBe("2026-09-25");
  });

  it("parses YYYY-MM-DD to UTC Date", () => {
    const d = parseYMD("2026-09-25");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(8); // September is 8 (0-indexed)
    expect(d.getUTCDate()).toBe(25);
  });

  it("calculates 7d preset correctly", () => {
    const ref = new Date(Date.UTC(2026, 8, 25));
    const range = getPresetDateRange("7d", ref);
    expect(range.end).toBe("2026-09-25");
    expect(range.start).toBe("2026-09-19");
  });

  it("calculates 30d preset correctly", () => {
    const ref = new Date(Date.UTC(2026, 8, 25));
    const range = getPresetDateRange("30d", ref);
    expect(range.end).toBe("2026-09-25");
    expect(range.start).toBe("2026-08-27");
  });

  it("calculates this_month preset correctly", () => {
    const ref = new Date(Date.UTC(2026, 8, 25));
    const range = getPresetDateRange("this_month", ref);
    expect(range.start).toBe("2026-09-01");
    expect(range.end).toBe("2026-09-25");
  });

  it("calculates previous comparison period accurately", () => {
    const comp = calculateComparisonPeriod("2026-09-19", "2026-09-25");
    expect(comp.durationDays).toBe(7);
    expect(comp.previousEnd).toBe("2026-09-18");
    expect(comp.previousStart).toBe("2026-09-12");
  });

  it("calculates delta percentage and direction", () => {
    const increase = calculateDelta(120, 100);
    expect(increase.diff).toBe(20);
    expect(increase.pct).toBe(20);
    expect(increase.positive).toBe(true);

    const decrease = calculateDelta(80, 100);
    expect(decrease.diff).toBe(-20);
    expect(decrease.pct).toBe(-20);
    expect(decrease.positive).toBe(false);

    const zeroPrev = calculateDelta(50, 0);
    expect(zeroPrev.pct).toBe(100);
    expect(zeroPrev.positive).toBe(true);
  });

  it("formats range labels cleanly", () => {
    const label = formatRangeLabel("2026-09-01", "2026-09-25");
    expect(label).toContain("Sep");
    expect(label).toContain("2026");
  });
});
