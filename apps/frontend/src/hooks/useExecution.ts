import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type {
  GapQueueItem,
  ExecutionJob,
  GeneratedContent,
  GapOutcome,
} from "@superrbrain/shared";

interface JobWithContent extends ExecutionJob {
  content: GeneratedContent | null;
}

// GET gap-queue
export function useGapQueue(brandId?: string) {
  return useQuery({
    queryKey: ["gap-queue", brandId],
    queryFn: () => api.get<GapQueueItem[]>(`/api/brands/${brandId}/gap-queue`),
    enabled: !!brandId,
  });
}

// POST execution (start job)
export function useStartExecution(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (citationGapId: string) =>
      api.post<{ job_id: string; status: string }>(`/api/brands/${brandId}/execution`, {
        citation_gap_id: citationGapId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gap-queue", brandId] });
    },
  });
}

// GET execution job (with polling while pending/running)
export function useExecutionJob(brandId?: string, jobId?: string) {
  return useQuery({
    queryKey: ["execution-job", brandId, jobId],
    queryFn: () =>
      api.get<JobWithContent>(`/api/brands/${brandId}/execution/${jobId}`),
    enabled: !!brandId && !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "pending" || status === "running") return 2000;
      return false;
    },
  });
}

// GET content
export function useContent(brandId?: string, contentId?: string) {
  return useQuery({
    queryKey: ["content", brandId, contentId],
    queryFn: () =>
      api.get<GeneratedContent>(`/api/brands/${brandId}/content/${contentId}`),
    enabled: !!brandId && !!contentId,
  });
}

// PUT update content
export function useUpdateContent(brandId: string, contentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { content_body?: string; status?: string }) =>
      api.put<GeneratedContent>(`/api/brands/${brandId}/content/${contentId}`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["content", brandId, contentId] });
      queryClient.invalidateQueries({ queryKey: ["execution-job", brandId] });
      if (variables.status === "approved") toast.success("Content approved");
      else if (variables.status === "rejected") toast.info("Content rejected");
      else if (variables.content_body) toast.success("Content saved");
    },
  });
}

// POST deploy content
export function useDeployContent(brandId: string, contentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deployedUrl: string) =>
      api.post<GeneratedContent>(`/api/brands/${brandId}/content/${contentId}/deploy`, {
        deployed_url: deployedUrl,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content", brandId, contentId] });
      queryClient.invalidateQueries({ queryKey: ["execution-job", brandId] });
      toast.success("Content deployed successfully");
    },
  });
}

// GET outcomes
export function useOutcomes(brandId?: string) {
  return useQuery({
    queryKey: ["outcomes", brandId],
    queryFn: () => api.get<GapOutcome[]>(`/api/brands/${brandId}/outcomes`),
    enabled: !!brandId,
  });
}
