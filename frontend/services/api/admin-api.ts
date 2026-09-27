import { apiRequest } from "@/services/api/client";

export interface MeResponse {
  email: string;
  is_admin: boolean;
  email_verified: boolean;
  created_at: string | null;
}

export interface AdminStats {
  total_users: number;
  active_users: number;
  admin_users: number;
  suspended_users: number;
  new_users_7d: number;
  total_documents: number;
  failed_documents: number;
  total_storage_bytes: number;
  total_sessions: number;
  total_messages: number;
  total_humanizer_runs: number;
  total_realtime_sessions: number;
  requests_24h: number;
  errors_24h: number;
  active_users_24h: number;
}

export interface AnalyticsDay {
  date: string;
  signups: number;
  documents: number;
  sessions: number;
  messages: number;
  humanizer_runs: number;
  realtime_sessions: number;
  requests: number;
  errors: number;
  active_users: number;
}

export interface AnalyticsHourlyCell {
  weekday: number; // 0 = Monday, 6 = Sunday
  hour: number; // 0..23 UTC
  requests: number;
  errors: number;
}

export interface AnalyticsEngagement {
  window_days: number;
  dau: number;
  wau: number;
  mau: number;
  /** Days in the window with at least one active user. */
  active_days: number;
  avg_dau: number;
  stickiness_pct: number;
}

export interface AnalyticsTool {
  tool: string;
  label: string;
  requests: number;
  errors: number;
  error_rate: number;
  avg_ms: number;
  p95_ms: number;
  users: number;
}

export interface AiCostBucket {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cost_usd: number;
  /** Calls whose model has no verified price; NOT included in cost_usd. */
  unpriced_calls: number;
  /** Web-search credits (Tavily) consumed; 0 for model calls. */
  search_credits: number;
}

export interface AiCost {
  start: string;
  end: string;
  total: AiCostBucket;
  by_model: (AiCostBucket & { model: string; kind: string })[];
  by_tool: (AiCostBucket & { tool: string | null; label: string })[];
  top_users: (AiCostBucket & { user_id: number; email: string })[];
  daily: (AiCostBucket & { date: string })[];
  unpriced_models: string[];
  pricing: { source: string; verified_on: string; note: string };
  search_pricing: { source: string; usd_per_credit: number; free_credits_per_month: number; note: string };
}

export interface AnalyticsParams {
  days?: number;
  start?: string;
  end?: string;
  user_id?: number;
  compare?: boolean;
}

export interface AdminAnalytics {
  days: number;
  since: string;
  start?: string;
  end?: string;
  series: AnalyticsDay[];
  tools: AnalyticsTool[];
  top_users: { user_id: number; email: string; requests: number }[];
  hourly: AnalyticsHourlyCell[];
  latency: { avg_ms: number; p95_ms: number };
  /** Distinct users with at least one request in the selected range. */
  active_users: number;
  /** DAU/WAU/MAU for the windows ending on the range's last day. */
  engagement: AnalyticsEngagement;
  previous?: AdminAnalytics;
}

export interface AdminUser {
  id: number;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  email_verified: boolean;
  created_at: string | null;
  document_count: number;
  session_count: number;
  last_active_at: string | null;
}

export interface AdminUserList {
  users: AdminUser[];
  total: number;
  skip: number;
  limit: number;
}

export type UserStatusFilter = "all" | "active" | "suspended";
export type UserRoleFilter = "all" | "admin" | "user";
export type UserSort = "newest" | "oldest" | "email";

export interface UserListParams {
  skip?: number;
  limit?: number;
  q?: string;
  status?: UserStatusFilter;
  role?: UserRoleFilter;
  sort?: UserSort;
}

export interface AdminUserDocument {
  id: string;
  name: string;
  size_bytes: number;
  upload_status: string;
  error_message: string | null;
  page_count: number | null;
  file_exists: boolean;
  created_at: string | null;
}

export interface AdminUserSession {
  id: number;
  title: string;
  pinned: boolean;
  message_count: number;
  created_at: string | null;
}

export interface AdminUserActivity {
  user_id: number;
  email: string;
  humanizer_runs: number;
  realtime_sessions: number;
  active_refresh_tokens: number;
  last_active_at: string | null;
  usage_30d: { tool: string; label: string; requests: number; errors: number }[];
  identities: string[];
}

export interface AdminDocument {
  id: string;
  name: string;
  owner_email: string | null;
  size_bytes: number;
  upload_status: string;
  error_message: string | null;
  page_count: number | null;
  pinned: boolean;
  created_at: string | null;
}

export interface AdminDocumentList {
  documents: AdminDocument[];
  total: number;
  skip: number;
  limit: number;
}

export type DocumentSizeClass = "all" | "small" | "medium" | "large";

export interface AdminDocumentSummary {
  count: number;
  bytes: number;
  by_status: Record<string, number>;
  by_size: { small: number; medium: number; large: number };
}

export type SettingType = "int" | "float" | "bool" | "str";
export type SettingValue = number | boolean | string;

export interface AdminSetting {
  key: string;
  value: SettingValue;
  default: SettingValue;
  min: number;
  max: number;
  type: SettingType;
  category: string;
  category_label: string;
  description: string;
  choices: string[] | null;
}

export interface AuditEntry {
  id: number;
  admin_email: string;
  action: string;
  target: string | null;
  details: string | null;
  created_at: string | null;
}

export interface AuditLogResponse {
  entries: AuditEntry[];
  total: number;
  skip: number;
  limit: number;
}

export interface UsageEvent {
  id: number;
  tool: string;
  user_email: string | null;
  status_code: number;
  ok: boolean;
  duration_ms: number;
  request_id: string | null;
  created_at: string | null;
}

export interface UsageEventList {
  events: UsageEvent[];
  total: number;
  skip: number;
  limit: number;
}

export interface SystemInfo {
  app_name: string;
  environment: string;
  debug: boolean;
  python_version: string;
  platform: string;
  uptime_seconds: number;
  rate_limit_enabled: boolean;
  database: { dialect: string; ok: boolean; alembic_version: string | null };
  vector_store: { ok: boolean | null };
  storage: { backend: "r2" | "local"; uploads_dir: string | null };
  openai: { configured: boolean; chat_model: string; ok: boolean | null };
  humanizer: {
    rewrite_model: string;
    classify_model: string;
    candidates: number;
    ultra_model: string;
    ultra_ollama_url: string;
    ultra_ok: boolean | null;
  };
  web_search: {
    configured: boolean;
    /** Only populated when probe=true — real numbers from Tavily's own
     *  /usage endpoint, the same key already used for search requests. */
    usage: { ok: boolean; plan?: string | null; plan_usage?: number | null; plan_limit?: number | null } | null;
  };
  email: {
    provider: string;
    from: string;
    /** Only populated when probe=true — a sample of up to 100 of the most
     *  recent emails from Resend's list-emails endpoint, the same key
     *  already used to send. Not a lifetime total (Resend's API doesn't
     *  expose one), just real recent delivery activity. */
    recent: {
      ok: boolean;
      sample_size?: number;
      has_more?: boolean;
      by_status?: Record<string, number>;
      most_recent_at?: string | null;
      /** True when the key is deliberately scoped to sending-only (see
       *  CLAUDE.md) and Resend rejected the read-only list-emails call for
       *  that reason — expected, not a failure. */
      restricted?: boolean;
    } | null;
  };
  uptimerobot: {
    configured: boolean;
    /** Only populated when probe=true and UPTIMEROBOT_API_KEY is set —
     *  real monitor status/uptime from UptimeRobot's own getMonitors API,
     *  a separate read-only key from anything the live app itself needs. */
    monitors: { ok: boolean; monitors?: { name: string; status: string; uptime_30d: string | number | null }[] } | null;
  };
  oauth: { google: boolean; github: boolean };
  admin_bootstrap_emails: number;
  retention: { days: number; last_run_at: string | null };
  external_apis: ExternalApiInfo[];
}

export interface ExternalApiInfo {
  name: string;
  category: string;
  configured: boolean;
  tracked_here: boolean;
  dashboard_url: string;
}

export interface StorageUsage {
  neon: {
    used_bytes: number;
    limit_bytes: number;
    percent_used: number;
    top_tables: { name: string; row_count: number; bytes: number }[];
  } | null;
  r2: {
    used_bytes: number;
    limit_bytes: number;
    percent_used: number;
    object_count: number;
    by_prefix: { prefix: string; bytes: number; count: number }[];
  } | null;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== "all");
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}

export interface AdminAlert {
  id: string;
  severity: "warning" | "critical";
  title: string;
  detail: string;
}

export const adminApi = {
  me: () => apiRequest<MeResponse>("/auth/me"),

  stats: () => apiRequest<AdminStats>("/admin/stats"),
  twoFactorStatus: () => apiRequest<{ enabled: boolean; verified: boolean }>("/admin/2fa/status"),
  twoFactorSetup: () => apiRequest<{ secret: string; otpauth_uri: string }>("/admin/2fa/setup", { method: "POST" }),
  twoFactorEnable: (code: string) =>
    apiRequest<{ enabled: boolean; token: string }>("/admin/2fa/enable", { method: "POST", body: JSON.stringify({ code }) }),
  twoFactorVerify: (code: string) =>
    apiRequest<{ token: string }>("/admin/2fa/verify", { method: "POST", body: JSON.stringify({ code }) }),
  twoFactorDisable: (code: string) =>
    apiRequest<{ enabled: boolean }>("/admin/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),
  alerts: () => apiRequest<{ alerts: AdminAlert[] }>("/admin/alerts"),
  aiUsage: (params: { start?: string; end?: string; user_id?: number }) =>
    apiRequest<AiCost>(`/admin/ai-usage${qs({ start: params.start, end: params.end, user_id: params.user_id })}`),
  analytics: (paramsOrDays: number | AnalyticsParams = 30) => {
    if (typeof paramsOrDays === "number") {
      return apiRequest<AdminAnalytics>(`/admin/analytics?days=${paramsOrDays}`);
    }
    return apiRequest<AdminAnalytics>(
      `/admin/analytics${qs({
        days: paramsOrDays.days,
        start: paramsOrDays.start,
        end: paramsOrDays.end,
        user_id: paramsOrDays.user_id,
        compare: paramsOrDays.compare ? "true" : undefined,
      })}`,
    );
  },

  users: (params: UserListParams = {}) =>
    apiRequest<AdminUserList>(`/admin/users${qs({ skip: params.skip ?? 0, limit: params.limit ?? 50, q: params.q, status: params.status, role: params.role, sort: params.sort })}`),

  /** Download the (filtered) user list as CSV. */
  exportUsers: (params: Pick<UserListParams, "q" | "status" | "role"> = {}): Promise<Blob> =>
    apiRequest<Blob>(`/admin/users/export${qs({ q: params.q, status: params.status, role: params.role })}`, {
      responseType: "blob",
    }),

  /** Generate the narrative PDF report for a UTC date range (optionally for one user). */
  downloadReport: (params: { start: string; end: string; user_id?: number }): Promise<Blob> =>
    apiRequest<Blob>(`/admin/report.pdf${qs({ start: params.start, end: params.end, user_id: params.user_id })}`, {
      responseType: "blob",
    }),

  patchUser: (userId: number, patch: { is_active?: boolean; is_admin?: boolean; email_verified?: boolean }) =>
    apiRequest<{ message: string }>(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteUser: (userId: number) =>
    apiRequest<{ message: string }>(`/admin/users/${userId}`, { method: "DELETE" }),

  bulkDeleteUsers: (userIds: number[]) =>
    apiRequest<{ deleted: string[]; failed: { user_id: number; error: string }[] }>("/admin/users/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ user_ids: userIds }),
    }),

  revokeUserSessions: (userId: number) =>
    apiRequest<{ message: string }>(`/admin/users/${userId}/revoke-sessions`, { method: "POST" }),

  userDocuments: (userId: number) =>
    apiRequest<{ documents: AdminUserDocument[] }>(`/admin/users/${userId}/documents`),

  userSessions: (userId: number) =>
    apiRequest<{ sessions: AdminUserSession[] }>(`/admin/users/${userId}/sessions`),

  userActivity: (userId: number) => apiRequest<AdminUserActivity>(`/admin/users/${userId}/activity`),

  documents: (params: { skip?: number; limit?: number; q?: string; status?: string; size?: DocumentSizeClass } = {}) =>
    apiRequest<AdminDocumentList>(
      `/admin/documents${qs({ skip: params.skip ?? 0, limit: params.limit ?? 50, q: params.q, status: params.status, size: params.size })}`,
    ),

  /** Whole-inventory totals, status breakdown and size classes (unaffected by list filters). */
  documentSummary: () => apiRequest<AdminDocumentSummary>("/admin/documents/summary"),

  deleteDocument: (documentId: string) =>
    apiRequest<{ message: string }>(`/admin/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" }),

  reingestDocument: (documentId: string) =>
    apiRequest<{ message: string }>(`/admin/documents/${encodeURIComponent(documentId)}/reingest`, { method: "POST" }),

  settings: () => apiRequest<AdminSetting[]>("/admin/settings"),

  updateSettings: (settings: Record<string, SettingValue>) =>
    apiRequest<AdminSetting[]>("/admin/settings", {
      method: "PUT",
      body: JSON.stringify({ settings }),
    }),

  uploadBackgroundImage: (page: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiRequest<{ page: string; image_url: string }>(`/admin/background/${encodeURIComponent(page)}`, {
      method: "POST",
      body,
    });
  },

  deleteBackgroundImage: (page: string) =>
    apiRequest<{ message: string }>(`/admin/background/${encodeURIComponent(page)}`, { method: "DELETE" }),

  uploadLogo: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiRequest<{ logo_url: string }>("/admin/logo", { method: "POST", body });
  },

  deleteLogo: () => apiRequest<{ message: string }>("/admin/logo", { method: "DELETE" }),

  auditLog: (params: { skip?: number; limit?: number; action?: string } = {}) =>
    apiRequest<AuditLogResponse>(`/admin/audit-log${qs({ skip: params.skip ?? 0, limit: params.limit ?? 50, action: params.action })}`),

  usageEvents: (params: { skip?: number; limit?: number; tool?: string; errors_only?: boolean; user_id?: number } = {}) =>
    apiRequest<UsageEventList>(
      `/admin/usage-events${qs({ skip: params.skip ?? 0, limit: params.limit ?? 50, tool: params.tool, errors_only: params.errors_only ? true : undefined, user_id: params.user_id })}`,
    ),

  system: (probe = false) => apiRequest<SystemInfo>(`/admin/system${probe ? "?probe=true" : ""}`),

  storageUsage: () => apiRequest<StorageUsage>("/admin/system/storage"),

  runRetention: () =>
    apiRequest<{ message: string; summary: Record<string, number> }>("/admin/retention/run", { method: "POST" }),
};
