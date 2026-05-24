"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { authApi } from "@/services/api/auth-api";
import { clearStoredTokens, setStoredTokens, getUserEmailFromToken } from "@/shared/lib/token-storage";
import type { LoginRequest, RegisterRequest, SendOtpRequest, VerifyOtpRequest } from "@/shared/types/api";
import { useAuthStore } from "@/stores/auth-store";

export function useAuth() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const isReady = useAuthStore((s) => s.isReady);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const email = useAuthStore((s) => s.email);

  const _handleTokens = (data: { access_token?: string; token?: string; refresh_token?: string; token_type?: string }) => {
    const accessToken = data.access_token || data.token;
    if (!accessToken) throw new Error("Missing access token in response");
    setStoredTokens({
      accessToken,
      refreshToken: data.refresh_token || null,
      tokenType: data.token_type || "bearer",
    });
    setAuth({
      accessToken,
      refreshToken: data.refresh_token || null,
      tokenType: data.token_type || "bearer",
      email: getUserEmailFromToken(accessToken),
    });
  };

  const loginMutation = useMutation({
    mutationFn: (payload: LoginRequest) => authApi.login(payload),
    onSuccess: (data) => {
      _handleTokens(data);
      router.replace("/chat");
    },
  });

  const registerMutation = useMutation({
    mutationFn: (payload: RegisterRequest) => authApi.register(payload),
    onSuccess: () => {
      router.push("/login");
    },
  });

  // Fetch which OAuth providers are configured (cached, no auth needed)
  const providersQuery = useQuery({
    queryKey: ["oauth-providers"],
    queryFn: () => authApi.oauthProviders(),
    staleTime: 60_000,
    retry: false,
  });

  const signupMutation = useMutation({
    mutationFn: (payload: { email: string; password: string }) => authApi.signup(payload),
  });

  const sendOtpMutation = useMutation({
    mutationFn: (payload: SendOtpRequest) => authApi.sendOtp(payload),
  });

  const verifyOtpMutation = useMutation({
    mutationFn: (payload: VerifyOtpRequest) => authApi.verifyOtp(payload),
    onSuccess: (data) => {
      if (data.access_token || data.token) {
        _handleTokens(data);
        // Caller decides routing based on is_new_user flag
      }
    },
  });

  const logout = () => {
    clearStoredTokens();
    clearAuth();
    router.replace("/login");
  };

  return {
    isReady,
    isAuthenticated,
    email,
    // Password auth (legacy)
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
    // Signup
    signup: signupMutation.mutateAsync,
    isSigningUp: signupMutation.isPending,
    // OTP auth
    sendOtp: sendOtpMutation.mutateAsync,
    verifyOtp: verifyOtpMutation.mutateAsync,
    isSendingOtp: sendOtpMutation.isPending,
    isVerifyingOtp: verifyOtpMutation.isPending,
    sendOtpError: sendOtpMutation.error,
    verifyOtpError: verifyOtpMutation.error,
    logout,
    // OAuth providers
    oauthProviders: providersQuery.data ?? { google: false, apple: false, facebook: false },
  };
}
