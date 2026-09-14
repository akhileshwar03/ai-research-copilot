import { apiRequest } from "@/services/api/client";
import type {
  RefreshRequest, RefreshResponse,
  SendOtpRequest, SendOtpResponse, VerifyOtpRequest, VerifyOtpResponse,
  OAuthProvidersResponse,
} from "@/shared/types/api";

// No password-based auth in this app — sign-in is email OTP (sendOtp/verifyOtp)
// or OAuth (oauthProviders + the backend's redirect-based /auth/oauth/* flow).

export const authApi = {
  /** Refresh via httpOnly cookie (credentials) with optional legacy body token. */
  refresh: (payload: RefreshRequest = {}) =>
    apiRequest<RefreshResponse>("/refresh", {
      method: "POST",
      body: JSON.stringify(payload),
      credentials: "include",
      skipAuth: true,
      skipRefresh: true,
    }),

  /** Revoke the refresh token server-side and clear the cookie. */
  logout: () =>
    apiRequest<{ message: string }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
      credentials: "include",
      skipAuth: true,
      skipRefresh: true,
    }),

  sendOtp: (payload: SendOtpRequest) =>
    apiRequest<SendOtpResponse>("/auth/send-otp", {
      method: "POST",
      body: JSON.stringify(payload),
      skipAuth: true,
    }),

  verifyOtp: (payload: VerifyOtpRequest) =>
    apiRequest<VerifyOtpResponse>("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify(payload),
      credentials: "include", // receive the httpOnly refresh cookie
      skipAuth: true,
    }),

  oauthProviders: () =>
    apiRequest<OAuthProvidersResponse>("/auth/oauth/providers", {
      skipAuth: true,
    }),

  deleteAccount: () =>
    apiRequest<{ message: string }>("/auth/account", {
      method: "DELETE",
    }),
};
