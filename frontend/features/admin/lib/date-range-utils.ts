export type DateRangePreset =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "this_month"
  | "last_month"
  | "ytd"
  | "custom";

export interface DateRangeState {
  preset: DateRangePreset;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  compare: boolean;
}

export interface PeriodComparison {
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
  durationDays: number;
}

/** Formats a Date object to YYYY-MM-DD in UTC. */
export function formatYMD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses YYYY-MM-DD to a UTC Date. */
export function parseYMD(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

/** Returns the start and end dates (YYYY-MM-DD) for a given preset relative to a reference date. */
export function getPresetDateRange(preset: DateRangePreset, now: Date = new Date()): { start: string; end: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endStr = formatYMD(end);

  switch (preset) {
    case "today": {
      return { start: endStr, end: endStr };
    }
    case "7d": {
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 6);
      return { start: formatYMD(start), end: endStr };
    }
    case "30d": {
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 29);
      return { start: formatYMD(start), end: endStr };
    }
    case "90d": {
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 89);
      return { start: formatYMD(start), end: endStr };
    }
    case "this_month": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { start: formatYMD(start), end: endStr };
    }
    case "last_month": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      return { start: formatYMD(start), end: formatYMD(lastMonthEnd) };
    }
    case "ytd": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      return { start: formatYMD(start), end: endStr };
    }
    case "custom":
    default: {
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 29);
      return { start: formatYMD(start), end: endStr };
    }
  }
}

/** Computes the equivalent preceding period for comparison. */
export function calculateComparisonPeriod(startStr: string, endStr: string): PeriodComparison {
  const startDate = parseYMD(startStr);
  const endDate = parseYMD(endStr);

  const diffMs = endDate.getTime() - startDate.getTime();
  const durationDays = Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)) + 1);

  const prevEnd = new Date(startDate);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);

  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - durationDays + 1);

  return {
    currentStart: startStr,
    currentEnd: endStr,
    previousStart: formatYMD(prevStart),
    previousEnd: formatYMD(prevEnd),
    durationDays,
  };
}

/** Calculates difference and percentage change between two values. */
export function calculateDelta(
  current: number,
  previous: number | undefined | null,
): { diff: number; pct: number | null; positive: boolean; neutral: boolean } {
  if (previous === undefined || previous === null) {
    return { diff: 0, pct: null, positive: true, neutral: true };
  }

  const diff = current - previous;
  if (previous === 0) {
    return {
      diff,
      pct: current === 0 ? 0 : 100,
      positive: diff >= 0,
      neutral: diff === 0,
    };
  }

  const pct = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  return {
    diff,
    pct,
    positive: diff > 0,
    neutral: diff === 0,
  };
}

/** Formats a range for human display, e.g. "Sep 1 – Sep 25, 2026". */
export function formatRangeLabel(startStr: string, endStr: string): string {
  if (startStr === endStr) {
    return parseYMD(startStr).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const s = parseYMD(startStr);
  const e = parseYMD(endStr);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();

  const startFormatted = s.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });
  const endFormatted = e.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${startFormatted} – ${endFormatted}`;
}
