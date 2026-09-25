import type { AdminAnalytics, AnalyticsDay, AnalyticsTool } from "@/services/api/admin-api";
import { formatDay, formatDuration } from "@/features/admin/components/shared";

export interface SystemInsight {
  id: string;
  category: "growth" | "record" | "reliability" | "usage" | "action" | "info";
  title: string;
  description: string;
  tone: "good" | "warn" | "info" | "neutral";
  metric?: string;
}

export function generateCommandInsights(
  analytics: AdminAnalytics | undefined | null,
  previous?: AdminAnalytics | null,
): SystemInsight[] {
  if (!analytics || !analytics.series || analytics.series.length === 0) {
    return [
      {
        id: "empty-state",
        category: "info",
        title: "Collecting Telemetry",
        description: "Activity data will populate as users interact with tools, upload documents, and generate chats.",
        tone: "neutral",
      },
    ];
  }

  const series = analytics.series;
  const tools = analytics.tools || [];
  const insights: SystemInsight[] = [];

  // 1. Peak Day / Best Day
  let peakDay: AnalyticsDay | null = null;
  let maxRequests = -1;
  let totalRequests = 0;
  let totalErrors = 0;
  let totalSignups = 0;

  for (const day of series) {
    totalRequests += day.requests;
    totalErrors += day.errors;
    totalSignups += day.signups;
    if (day.requests > maxRequests) {
      maxRequests = day.requests;
      peakDay = day;
    }
  }

  if (peakDay && maxRequests > 0) {
    insights.push({
      id: "peak-day",
      category: "record",
      title: `Peak Window Volume on ${formatDay(peakDay.date)}`,
      description: `Highest single-day activity reached ${maxRequests.toLocaleString()} requests with ${peakDay.messages} messages and ${peakDay.documents} documents uploaded.`,
      tone: "good",
      metric: `${maxRequests.toLocaleString()} reqs`,
    });
  }

  // 2. Primary Tool Engine & Mover
  if (tools.length > 0) {
    const sortedByRequests = [...tools].sort((a, b) => b.requests - a.requests);
    const topTool: AnalyticsTool = sortedByRequests[0];
    const topToolPct = totalRequests > 0 ? Math.round((topTool.requests / totalRequests) * 100) : 0;

    insights.push({
      id: "top-tool",
      category: "usage",
      title: `${topTool.label} Dominates Demand`,
      description: `Generates ${topToolPct}% of total platform requests (${topTool.requests.toLocaleString()} calls, avg latency ${formatDuration(topTool.avg_ms)}) across ${topTool.users} active users.`,
      tone: "info",
      metric: `${topToolPct}% share`,
    });
  }

  // 3. Reliability & Actionable Issues
  const overallErrorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;
  const problematicTools = tools.filter((t) => t.requests > 10 && t.error_rate > 0.05);

  if (problematicTools.length > 0) {
    const names = problematicTools.map((t) => t.label).join(", ");
    insights.push({
      id: "tool-errors-action",
      category: "action",
      title: `${problematicTools.length} Tool${problematicTools.length === 1 ? "" : "s"} With Elevated Errors`,
      description: `${names} exceeded the 5% error threshold. Inspect provider quotas and backend logs in the Audit tab.`,
      tone: "warn",
      metric: `${(overallErrorRate * 100).toFixed(1)}% err rate`,
    });
  } else if (totalRequests > 0) {
    const successRate = ((1 - overallErrorRate) * 100).toFixed(1);
    insights.push({
      id: "system-reliability",
      category: "reliability",
      title: "Clean Operational Scorecard",
      description: `All AI models and ingestion pipelines are healthy with a ${successRate}% success rate across ${totalRequests.toLocaleString()} calls.`,
      tone: "good",
      metric: `${successRate}% uptime`,
    });
  }

  // 4. Momentum vs Previous Window
  if (previous && previous.series && previous.series.length > 0) {
    const prevRequests = previous.series.reduce((sum, d) => sum + d.requests, 0);
    const prevSignups = previous.series.reduce((sum, d) => sum + d.signups, 0);

    const reqDelta = prevRequests > 0 ? Math.round(((totalRequests - prevRequests) / prevRequests) * 100) : 0;
    const isPositive = reqDelta >= 0;

    insights.push({
      id: "period-momentum",
      category: "growth",
      title: `Momentum: ${isPositive ? "+" : ""}${reqDelta}% vs Previous Period`,
      description: `${totalRequests.toLocaleString()} requests vs ${prevRequests.toLocaleString()} in the prior period. New accounts changed from ${prevSignups} to ${totalSignups}.`,
      tone: isPositive ? "good" : "neutral",
      metric: `${isPositive ? "+" : ""}${reqDelta}%`,
    });
  } else if (totalSignups > 0) {
    insights.push({
      id: "signup-momentum",
      category: "growth",
      title: `User Growth: +${totalSignups} New Accounts`,
      description: `${totalSignups} user signups recorded in this date range. Platform adoption continues to expand.`,
      tone: "good",
      metric: `+${totalSignups} signups`,
    });
  }

  return insights.slice(0, 4);
}
