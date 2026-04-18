import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Page, CitationRun } from "@covable/shared";

export function usePages(brandId?: string, status?: string) {
  const params = new URLSearchParams();
  if (brandId) params.set("brand_id", brandId);
  if (status) params.set("status", status);

  return useQuery({
    queryKey: ["pages", brandId, status],
    queryFn: () => api.get<Page[]>(`/api/pages?${params}`),
    enabled: !!brandId,
  });
}

export function usePage(pageId?: string) {
  return useQuery({
    queryKey: ["page", pageId],
    queryFn: () => api.get<Page>(`/api/pages/${pageId}`),
    enabled: !!pageId,
  });
}

export function usePageCitationRuns(pageId?: string) {
  return useQuery({
    queryKey: ["citation-runs", pageId],
    queryFn: () => api.get<CitationRun[]>(`/api/pages/${pageId}/citation-runs`),
    enabled: !!pageId,
  });
}

export function useUpdatePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { title?: string; content?: string; tldr?: string };
    }) => api.patch<Page>(`/api/pages/${id}`, data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["page", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      toast.success("Page updated — rescoring...");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useGeneratePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ promptId, brandId }: { promptId: string; brandId: string }) =>
      api.post<{ status: string }>("/api/pages/generate", {
        prompt_id: promptId,
        brand_id: brandId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      toast.success("Generating page... this takes ~2-3 minutes");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function usePublishPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, publisherId }: { pageId: string; publisherId: string }) =>
      api.post<{ status: string }>(`/api/pages/${pageId}/publish`, {
        publisher_id: publisherId,
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["page", vars.pageId] });
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      toast.success("Publishing...");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useScorePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) =>
      api.post<{ status: string }>(`/api/pages/${pageId}/score`),
    onSuccess: (_, pageId) => {
      queryClient.invalidateQueries({ queryKey: ["page", pageId] });
      toast.success("Re-scoring...");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
