import type { ChatSession, Message } from "@/shared/types/chat";

export interface ApiError {
  error?: { code: string; message: string; request_id?: string };
  detail?: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginRequest { email: string; password: string }
export interface RegisterRequest { email: string; password: string }
export interface RefreshRequest { refresh_token: string }

export interface LoginResponse {
  token?: string;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
}

export interface RefreshResponse {
  token?: string;
  access_token?: string;
  token_type?: string;
}

// ── OTP ───────────────────────────────────────────────────────────────────────

export interface SendOtpRequest { email: string }
export interface SendOtpResponse {
  message: string;
  /** Only present in dev mode (no SMTP configured). Auto-fills the OTP box. */
  _dev_code?: string;
}
export interface VerifyOtpRequest { email: string; code: string; password?: string }
export interface VerifyOtpResponse {
  token?: string;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  is_new_user?: boolean;
}
export interface OAuthProvidersResponse {
  google: boolean;
  apple: boolean;
  facebook: boolean;
  [key: string]: boolean;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export interface SessionPayload { session: ChatSession }
export interface SessionCreateResponse { id: number }

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatRequest { messages: Message[]; document_id?: string | null }

// ── Documents ─────────────────────────────────────────────────────────────────

export interface DocumentItem {
  id: string;
  name: string;
  size_bytes?: number;
  upload_status?: string;
  created_at?: string;
}
export interface DocumentsResponse { documents: DocumentItem[] }
