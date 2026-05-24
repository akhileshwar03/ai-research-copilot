"use client";

import { useEffect } from "react";

import { authApi } from "@/services/api/auth-api";
import {
  clearStoredTokens,
  getStoredTokens,
  getUserEmailFromToken,
  isTokenExpired,
  setStoredTokens,
} from "@/shared/lib/token-storage";
import { useAuthStore } from "@/stores/auth-store";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setReady = useAuthStore((s) => s.setReady);

  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      const { accessToken, refreshToken, tokenType } = getStoredTokens();

      const accessEmail = getUserEmailFromToken(accessToken);
      const accessValid = Boolean(accessToken && accessEmail && !isTokenExpired(accessToken));

      if (accessValid) {
        if (!cancelled) {
          setAuth({
            accessToken: accessToken as string,
            refreshToken,
            tokenType,
            email: accessEmail,
          });
          setReady(true);
        }
        return;
      }

      if (refreshToken && !isTokenExpired(refreshToken)) {
        try {
          const refreshed = await authApi.refresh({ refresh_token: refreshToken });
          const nextAccessToken = refreshed.access_token || refreshed.token;
          const nextEmail = getUserEmailFromToken(nextAccessToken || null);

          if (nextAccessToken && nextEmail && !cancelled) {
            setStoredTokens({
              accessToken: nextAccessToken,
              refreshToken,
              tokenType: refreshed.token_type || "bearer",
            });
            setAuth({
              accessToken: nextAccessToken,
              refreshToken,
              tokenType: refreshed.token_type || "bearer",
              email: nextEmail,
            });
            setReady(true);
            return;
          }
        } catch {
          clearStoredTokens();
        }
      }

      if (!cancelled) {
        clearStoredTokens();
        clearAuth();
        setReady(true);
      }
    };

    void bootstrapAuth();

    return () => {
      cancelled = true;
    };
  }, [setAuth, clearAuth, setReady]);

  return <>{children}</>;
}
