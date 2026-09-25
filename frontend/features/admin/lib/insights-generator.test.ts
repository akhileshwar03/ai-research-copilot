import { describe, expect, it } from "vitest";
import { generateCommandInsights } from "./insights-generator";
import type { AdminAnalytics } from "@/services/api/admin-api";

describe("insights-generator", () => {
  it("returns collecting telemetry insight when data is empty", () => {
    const empty: AdminAnalytics = {
      days: 30,
      since: "2026-08-25",
      series: [],
      tools: [],
      top_users: [],
      active_users_7d: 0,
      active_users_30d: 0,
      documents_by_status: {},
    };
    const insights = generateCommandInsights(empty);
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0].category).toBe("info");
  });

  it("identifies peak volume day and top tool", () => {
    const analytics: AdminAnalytics = {
      days: 3,
      since: "2026-09-01",
      series: [
        {
          date: "2026-09-01",
          requests: 100,
          errors: 1,
          signups: 2,
          documents: 5,
          sessions: 10,
          messages: 40,
          humanizer_runs: 5,
          realtime_sessions: 2,
        },
        {
          date: "2026-09-02",
          requests: 350, // Peak
          errors: 2,
          signups: 4,
          documents: 12,
          sessions: 25,
          messages: 120,
          humanizer_runs: 8,
          realtime_sessions: 5,
        },
        {
          date: "2026-09-03",
          requests: 120,
          errors: 0,
          signups: 1,
          documents: 3,
          sessions: 12,
          messages: 50,
          humanizer_runs: 2,
          realtime_sessions: 1,
        },
      ],
      tools: [
        {
          tool: "research_copilot",
          label: "Research Copilot",
          requests: 400,
          errors: 2,
          error_rate: 0.005,
          avg_ms: 220,
          p95_ms: 450,
          users: 15,
        },
      ],
      top_users: [],
      active_users_7d: 15,
      active_users_30d: 20,
      documents_by_status: {},
    };

    const insights = generateCommandInsights(analytics);
    expect(insights.some((i) => i.id === "peak-day")).toBe(true);
    expect(insights.some((i) => i.id === "top-tool")).toBe(true);
    expect(insights.some((i) => i.id === "system-reliability")).toBe(true);
  });

  it("flags tool error issues when error rate exceeds threshold", () => {
    const analyticsWithErrors: AdminAnalytics = {
      days: 1,
      since: "2026-09-01",
      series: [
        {
          date: "2026-09-01",
          requests: 100,
          errors: 10,
          signups: 0,
          documents: 0,
          sessions: 0,
          messages: 0,
          humanizer_runs: 0,
          realtime_sessions: 0,
        },
      ],
      tools: [
        {
          tool: "broken_tool",
          label: "Broken Tool",
          requests: 50,
          errors: 8,
          error_rate: 0.16,
          avg_ms: 500,
          p95_ms: 1200,
          users: 5,
        },
      ],
      top_users: [],
      active_users_7d: 5,
      active_users_30d: 5,
      documents_by_status: {},
    };

    const insights = generateCommandInsights(analyticsWithErrors);
    expect(insights.some((i) => i.id === "tool-errors-action")).toBe(true);
  });
});
