"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { humanizerApi, type HumanizeStyle } from "@/services/api/humanizer-api";

/** Content history for the Humaniser — list/save/delete past runs, following
 * the same react-query list+mutation+invalidate pattern as useSessions. */
export function useHumanizerHistory(enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["humanizer-runs"],
    queryFn: () => humanizerApi.listRuns(),
    enabled,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["humanizer-runs"] });

  const saveMutation = useMutation({
    mutationFn: ({ inputText, outputText, style }: { inputText: string; outputText: string; style: HumanizeStyle }) =>
      humanizerApi.saveRun(inputText, outputText, style),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (runId: number) => humanizerApi.deleteRun(runId),
    onSuccess: invalidate,
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => humanizerApi.deleteAllRuns(),
    onSuccess: invalidate,
  });

  return {
    runs: query.data?.runs ?? [],
    isLoading: query.isLoading,
    saveRun: saveMutation.mutateAsync,
    deleteRun: deleteMutation.mutateAsync,
    deleteAllRuns: deleteAllMutation.mutateAsync,
  };
}
