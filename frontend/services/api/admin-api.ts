import { buildApiUrl } from "@/constants/config";
import { apiRequest } from "@/services/api/client";
import { getStoredTokens } from "@/shared/lib/token-storage";

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

export interface AdminAnalytics {
  days: number;
  since: string;
  series: AnalyticsDay[];
  tools: AnalyticsTool[];
  top_users: { user_id: number; email: string; requests: number }[];
  active_users_7d: number;
  active_users_30d: number;
  documents_by_status: Record<string, number>;
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
  web_search: { configured: boolean };
  email: { provider: string; from: string };
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

export const adminApi = {
  me: () => apiRequest<MeResponse>("/auth/me"),

  stats: () => apiRequest<AdminStats>("/admin/stats"),
  analytics: (days = 30) => apiRequest<AdminAnalytics>(`/admin/analytics?days=${days}`),

  users: (params: UserListParams = {}) =>
    apiRequest<AdminUserList>(`/admin/users${qs({ skip: params.skip ?? 0, limit: params.limit ?? 50, q: params.q, status: params.status, role: params.role, sort: params.sort })}`),

  /** Download the (filtered) user list as CSV — returns a blob URL to trigger a browser download. */
  exportUsers: async (params: Pick<UserListParams, "q" | "status" | "role"> = {}): Promise<Blob> => {
    const { accessToken, tokenType } = getStoredTokens();
    const response = await fetch(buildApiUrl(`/admin/users/export${qs({ q: params.q, status: params.status, role: params.role })}`), {
      headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
    });
    if (!response.ok) throw new Error(`Export failed: ${response.status}`);
    return response.blob();
  },

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

  documents: (params: { skip?: number; limit?: number; q?: string; status?: string } = {}) =>
    apiRequest<AdminDocumentList>(`/admin/documents${qs({ skip: params.skip ?? 0, limit: params.limit ?? 50, q: params.q, status: params.status })}`),

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
