import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Publisher, CreatePublisherInput, UpdatePublisherInput } from "@covable/shared";

export function usePublishers(brandId?: string) {
  return useQuery({
    queryKey: ["publishers", brandId],
    queryFn: () => api.get<Publisher[]>(`/api/publishers?brand_id=${brandId}`),
    enabled: !!brandId,
  });
}

export function useCreatePublisher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePublisherInput) => api.post<Publisher>("/api/publishers", data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["publishers", vars.brand_id] });
      toast.success("CMS connected");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdatePublisher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePublisherInput }) =>
      api.patch<Publisher>(`/api/publishers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publishers"] });
      toast.success("Publisher updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeletePublisher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/api/publishers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publishers"] });
      toast.success("CMS disconnected");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useTestPublisher() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean }>(`/api/publishers/${id}/test`),
    onSuccess: () => toast.success("Connection verified"),
    onError: (err: Error) => toast.error(`Connection failed: ${err.message}`),
  });
}
