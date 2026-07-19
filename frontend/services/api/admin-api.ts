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
  total_documents: number;
  total_storage_bytes: number;
  total_sessions: number;
  total_messages: number;
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
}

export interface AdminUserList {
  users: AdminUser[];
  total: number;
  skip: number;
  limit: number;
}

export interface AdminUserDocument {
  id: string;
  name: string;
  size_bytes: number;
  upload_status: string;
  error_message: string | null;
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

export interface AdminSetting {
  key: string;
  value: number;
  default: number;
  min: number;
  max: number;
  type: "int" | "float";
  description: string;
}

export const adminApi = {
  me: () => apiRequest<MeResponse>("/auth/me"),

  stats: () => apiRequest<AdminStats>("/admin/stats"),

  users: (skip = 0, limit = 50, q = "") =>
    apiRequest<AdminUserList>(
      `/admin/users?skip=${skip}&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    ),

  patchUser: (userId: number, patch: { is_active?: boolean; is_admin?: boolean }) =>
    apiRequest<{ message: string }>(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteUser: (userId: number) =>
    apiRequest<{ message: string }>(`/admin/users/${userId}`, { method: "DELETE" }),

  userDocuments: (userId: number) =>
    apiRequest<{ documents: AdminUserDocument[] }>(`/admin/users/${userId}/documents`),

  userSessions: (userId: number) =>
    apiRequest<{ sessions: AdminUserSession[] }>(`/admin/users/${userId}/sessions`),

  settings: () => apiRequest<AdminSetting[]>("/admin/settings"),

  updateSettings: (settings: Record<string, number>) =>
    apiRequest<AdminSetting[]>("/admin/settings", {
      method: "PUT",
      body: JSON.stringify({ settings }),
    }),
};
