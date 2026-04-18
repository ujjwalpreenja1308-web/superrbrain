import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ReinforcementJob, UpdateReinforcementInput } from "@covable/shared";

export function useReinforcementJobs(pageId?: string) {
  return useQuery({
    queryKey: ["reinforcement", pageId],
    queryFn: () => api.get<ReinforcementJob[]>(`/api/reinforcement?page_id=${pageId}`),
    enabled: !!pageId,
  });
}

export function useApproveReinforcement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      api.post<{ success: boolean; jobId: string }>(`/api/reinforcement/${jobId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reinforcement"] });
      toast.success("Approved — posting scheduled");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateReinforcement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateReinforcementInput }) =>
      api.patch<ReinforcementJob>(`/api/reinforcement/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reinforcement"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useTriggerReinforcement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) =>
      api.post<{ status: string }>(`/api/reinforcement/trigger?page_id=${pageId}`),
    onSuccess: (_, pageId) => {
      queryClient.invalidateQueries({ queryKey: ["reinforcement", pageId] });
      toast.success("Reinforcement triggered");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
