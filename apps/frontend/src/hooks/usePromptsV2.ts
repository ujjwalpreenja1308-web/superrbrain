import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { PromptV2, CreatePromptV2Input, UpdatePromptV2Input } from "@covable/shared";

export function usePromptsV2(brandId?: string, minGapScore?: number) {
  const params = new URLSearchParams();
  if (brandId) params.set("brand_id", brandId);
  if (minGapScore !== undefined) params.set("min_gap_score", String(minGapScore));

  return useQuery({
    queryKey: ["prompts-v2", brandId, minGapScore],
    queryFn: () => api.get<PromptV2[]>(`/api/prompts-v2?${params}`),
    enabled: !!brandId,
  });
}

export function useCreatePromptV2() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePromptV2Input) => api.post<PromptV2>("/api/prompts-v2", data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["prompts-v2", vars.brand_id] });
      toast.success("Prompt created");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdatePromptV2() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePromptV2Input }) =>
      api.patch<PromptV2>(`/api/prompts-v2/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts-v2"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeletePromptV2() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/api/prompts-v2/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts-v2"] });
      toast.success("Prompt deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useGenerateVariants() {
  return useMutation({
    mutationFn: (promptId: string) =>
      api.post<{ status: string }>(`/api/prompts-v2/${promptId}/variants/generate`),
    onSuccess: () => toast.success("Generating variants..."),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSeedPromptsV2() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (brandId: string) =>
      api.post<{ inserted: number }>("/api/prompts-v2/seed", { brand_id: brandId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["prompts-v2"] });
      toast.success(`Seeded ${data.inserted} prompts from existing monitoring prompts`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function usePrioritizePrompts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (brandId: string) =>
      api.post<{ success: boolean }>("/api/prompts-v2/prioritize", { brand_id: brandId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts-v2"] });
      toast.success("Gap scores recalculated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
