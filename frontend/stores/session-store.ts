import { create } from "zustand";

import type { ChatSession, Message } from "@/shared/types/chat";

export type SessionSortOrder = "latest" | "alpha";

interface SessionState {
  sessions: ChatSession[];
  activeSessionId: number | null;
  sortOrder: SessionSortOrder;

  setSessions: (sessions: ChatSession[]) => void;
  setActiveSessionId: (id: number | null) => void;
  setSortOrder: (order: SessionSortOrder) => void;
  upsertSession: (session: ChatSession) => void;
  updateMessages: (sessionId: number, messages: Message[]) => void;
  togglePin: (sessionId: number) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  activeSessionId: null,
  sortOrder: "latest",

  setSessions: (sessions) => set({ sessions }),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  setSortOrder: (sortOrder) => set({ sortOrder }),

  upsertSession: (session) =>
    set((state) => {
      const index = state.sessions.findIndex((s) => s.id === session.id);
      if (index === -1) {
        return { sessions: [session, ...state.sessions], activeSessionId: session.id };
      }
      const next = [...state.sessions];
      next[index] = session;
      return { sessions: next };
    }),

  updateMessages: (sessionId, messages) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId ? { ...session, messages } : session
      ),
    })),

  togglePin: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, pinned: !s.pinned } : s
      ),
    })),
}));
