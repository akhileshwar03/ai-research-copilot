import { create } from "zustand";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string;
  email: string | null;
  isReady: boolean;
  isAuthenticated: boolean;
  setAuth: (input: { accessToken: string; refreshToken?: string | null; tokenType?: string; email?: string | null }) => void;
  clearAuth: () => void;
  setReady: (ready: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  tokenType: "bearer",
  email: null,
  isReady: false,
  isAuthenticated: false,
  setAuth: ({ accessToken, refreshToken = null, tokenType = "bearer", email = null }) =>
    set({
      accessToken,
      refreshToken,
      tokenType,
      email,
      isAuthenticated: Boolean(accessToken && email),
    }),
  clearAuth: () =>
    set({
      accessToken: null,
      refreshToken: null,
      tokenType: "bearer",
      email: null,
      isAuthenticated: false,
    }),
  setReady: (isReady) => set({ isReady }),
}));
