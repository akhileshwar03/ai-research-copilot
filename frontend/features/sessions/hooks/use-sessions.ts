"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionsApi } from "@/services/api/sessions-api";
import type { ChatSession } from "@/shared/types/chat";
import type { SessionsResponse } from "@/shared/types/api";
import { useSessionStore } from "@/stores/session-store";

const initialAssistantMessage = {
  role: "assistant" as const,
  content: "Welcome to Querex.",
};

export function makeDefaultSession(): ChatSession {
  return {
    id: Date.now(),
    title: "New Chat",
    pinned: false,
    messages: [initialAssistantMessage],
  };
}

export function useSessions(email: string | null) {
  const queryClient = useQueryClient();
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setSessions = useSessionStore((s) => s.setSessions);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);

  const query = useQuery({
    queryKey: ["sessions"],
    queryFn: () => sessionsApi.list(),
    enabled: Boolean(email),
  });

  useEffect(() => {
    // The workspace must ALWAYS end up with an active session once the
    // sessions request settles — success, empty, or failure. An unhandled
    // error here used to leave activeSessionId null and the chat window
    // stuck on its loading spinner forever.
    if (query.isError) {
      if (sessions.length === 0) {
        const fallback = makeDefaultSession();
        setSessions([fallback]);
        setActiveSessionId(fallback.id);
      }
      return;
    }

    if (!query.data) return;

    // Backend returns a paginated envelope — pull the sessions array out.
    const fetched: ChatSession[] = query.data.sessions ?? [];

    if (fetched.length > 0) {
      setSessions(fetched);
      if (activeSessionId === null) {
        setActiveSessionId(fetched[0].id);
      }
      return;
    }

    if (sessions.length === 0) {
      const defaultSession = makeDefaultSession();
      setSessions([defaultSession]);
      setActiveSessionId(defaultSession.id);
    }
  }, [query.data, query.isError, setSessions, setActiveSessionId, activeSessionId, sessions.length]);

  const createMutation = useMutation({
    // No onSuccess invalidation here on purpose: the caller (handleNewSession)
    // already remaps the local placeholder id into Zustand directly. An
    // invalidate here used to schedule a background refetch that could land
    // *after* the session's first message was saved (via useChat's own
    // update, which bypasses this query entirely) but reflect the
    // pre-message snapshot — silently overwriting the newer local state with
    // a blank session. See use-chat.ts's updateMutation for the other half
    // of this fix (it write-throughs the cache instead of invalidating).
    mutationFn: (session: ChatSession) => sessionsApi.create({ session }),
  });

  const updateMutation = useMutation({
    mutationFn: (session: ChatSession) => sessionsApi.update(session.id, { session }),
  });

  const deleteMutation = useMutation({
    mutationFn: (sessionId: number) => sessionsApi.remove(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // The single, canonical "start a new chat" flow. Previously this logic was
  // hand-rolled twice — once (buggy, stale-closure, no race guards) in
  // chat/page.tsx for ⌘N/⌘K, and once (correct, race-safe) in the sidebar's
  // "+" button — so which bugs you hit depended on which button you clicked.
  // Now every caller shares this one implementation via useSessions(email).
  const createNewSession = useCallback(async () => {
    setIsCreatingSession(true);
    try {
      // Stamp created_at immediately so the sessions panel's "expires in Nd"
      // caption renders right away instead of staying blank until the next
      // full sessions list reload.
      const draft = { ...makeDefaultSession(), created_at: new Date().toISOString() };
      // Read current sessions from the store directly (not the closed-over
      // `sessions` value) so a rapid double-invocation can't stomp on itself.
      const currentSessions = useSessionStore.getState().sessions;
      setSessions([draft, ...currentSessions]);
      setActiveSessionId(draft.id);

      if (!email) return draft;

      const created = await createMutation.mutateAsync(draft);
      const persisted = { ...draft, id: created.id };

      // Cancel any in-flight ["sessions"] fetch before writing — otherwise a
      // slower, older response already queued when this call started could
      // resolve afterward and silently overwrite this session with a
      // pre-message snapshot, making it appear blank.
      await queryClient.cancelQueries({ queryKey: ["sessions"] });

      const latestSessions = useSessionStore.getState().sessions;
      setSessions([persisted, ...latestSessions.filter((s) => s.id !== draft.id)]);
      setActiveSessionId(persisted.id);

      queryClient.setQueryData<SessionsResponse>(["sessions"], (old) => {
        if (!old) return old;
        return { ...old, sessions: [persisted, ...old.sessions.filter((s) => s.id !== draft.id && s.id !== persisted.id)] };
      });

      return persisted;
    } finally {
      setIsCreatingSession(false);
    }
  }, [email, queryClient, setSessions, setActiveSessionId, createMutation]);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    setSessions,
    createSession: createMutation.mutateAsync,
    createNewSession,
    isCreatingSession,
    updateSession: updateMutation.mutateAsync,
    deleteSession: deleteMutation.mutateAsync,
    isLoadingSessions: query.isLoading,
    refetchSessions: query.refetch,
    retentionDays: query.data?.retention_days ?? 0,
  };
}
