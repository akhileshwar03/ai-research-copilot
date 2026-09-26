import type { AdminAnalytics } from "@/services/api/admin-api";

export interface AnalyticsHourlyCell {
  weekday: number; // 0=Monday, 6=Sunday
  hour: number;    // 0..23 UTC
  requests: number;
  errors: number;
}

export type AdminAnalyticsWithHourly = AdminAnalytics & {
  hourly?: AnalyticsHourlyCell[];
};

export const CATEGORICAL_PALETTE = [
  "#d9793a", // Brand Amber
  "#0284c7", // Sky Blue
  "#059669", // Emerald Green
  "#7c3aed", // Violet
  "#e11d48", // Rose Red
  "#d97706", // Golden Ochre
  "#0891b2", // Deep Cyan
  "#4f46e5", // Indigo
  "#64748b", // Neutral Slate
];

export const SEQUENTIAL_SCALE = [
  "rgba(217, 121, 58, 0.08)",
  "rgba(217, 121, 58, 0.25)",
  "rgba(217, 121, 58, 0.50)",
  "rgba(217, 121, 58, 0.75)",
  "rgba(217, 121, 58, 1.00)",
];

export const ERROR_SEQUENTIAL_SCALE = [
  "rgba(244, 63, 94, 0.08)",
  "rgba(244, 63, 94, 0.25)",
  "rgba(244, 63, 94, 0.50)",
  "rgba(244, 63, 94, 0.75)",
  "rgba(244, 63, 94, 1.00)",
];
