"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { realtimeApi, type RealtimeSessionPayload } from "@/services/api/realtime-api";

export function useRealtimeSessions() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["realtime-sessions"],
    queryFn: () => realtimeApi.listSessions(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["realtime-sessions"] });

  const createMutation = useMutation({
    mutationFn: (session: RealtimeSessionPayload) => realtimeApi.createSession(session),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: (session: RealtimeSessionPayload) => realtimeApi.updateSession(session),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => realtimeApi.deleteSession(id),
    onSuccess: invalidate,
  });

  return {
    sessions: query.data?.sessions ?? [],
    isLoading: query.isLoading,
    retentionDays: query.data?.retention_days ?? 0,
    createSession: createMutation.mutateAsync,
    updateSession: updateMutation.mutateAsync,
    deleteSession: deleteMutation.mutateAsync,
  };
}
