import { apiRequest } from "@/services/api/client";
import type {
  LoginRequest, LoginResponse,
  RefreshRequest, RefreshResponse,
  RegisterRequest,
  SendOtpRequest, SendOtpResponse, VerifyOtpRequest, VerifyOtpResponse,
  OAuthProvidersResponse,
} from "@/shared/types/api";

export const authApi = {
  register: (payload: RegisterRequest) =>
    apiRequest<{ message: string }>("/register", {
      method: "POST",
      body: JSON.stringify(payload),
      skipAuth: true,
    }),

  login: (payload: LoginRequest) =>
    apiRequest<LoginResponse>("/login", {
      method: "POST",
      body: JSON.stringify(payload),
      skipAuth: true,
    }),

  refresh: (payload: RefreshRequest) =>
    apiRequest<RefreshResponse>("/refresh", {
      method: "POST",
      body: JSON.stringify(payload),
      skipAuth: true,
      skipRefresh: true,
    }),

  signup: (payload: { email: string; password: string }) =>
    apiRequest<{ email: string; needs_otp: boolean }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
      skipAuth: true,
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
      skipAuth: true,
    }),

  oauthProviders: () =>
    apiRequest<OAuthProvidersResponse>("/auth/oauth/providers", {
      skipAuth: true,
    }),
};
