import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Brand, Prompt } from "@covable/shared";

export function useBrands() {
  return useQuery({
    queryKey: ["brands"],
    queryFn: () => api.get<Brand[]>("/api/brands"),
  });
}

export function useBrand(brandId?: string) {
  const queryClient = useQueryClient();
  const wasRunningRef = useRef(false);

  return useQuery({
    queryKey: ["brand", brandId],
    queryFn: async () => {
      const brand = await api.get<Brand>(`/api/brands/${brandId}`);

      const isRunning =
        brand.status === "onboarding" ||
        brand.status === "running" ||
        brand.status === "pending";

      // Transition: was running, now done → invalidate all dependent queries
      if (wasRunningRef.current && !isRunning && brandId) {
        wasRunningRef.current = false;
        queryClient.invalidateQueries({ queryKey: ["brands"] });
        queryClient.invalidateQueries({ queryKey: ["report", brandId] });
        queryClient.invalidateQueries({ queryKey: ["citations", brandId] });
        queryClient.invalidateQueries({ queryKey: ["gaps", brandId] });
      } else {
        wasRunningRef.current = isRunning;
      }

      return brand;
    },
    enabled: !!brandId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (
        data &&
        (data.status === "onboarding" ||
          data.status === "running" ||
          data.status === "pending")
      ) {
        return 3000; // poll every 3s while job is running
      }
      return false;
    },
  });
}

export function useCreateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { url: string; country?: string; city?: string }) =>
      api.post<Brand>("/api/brands", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      queryClient.invalidateQueries({ queryKey: ["brand"] });
    },
  });
}

export function usePrompts(brandId?: string) {
  return useQuery({
    queryKey: ["prompts", brandId],
    queryFn: () => api.get<Prompt[]>(`/api/brands/${brandId}/prompts`),
    enabled: !!brandId,
  });
}

export function useUpdatePrompts(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      prompts: {
        id?: string;
        text: string;
        is_active: boolean;
        category?: string | null;
      }[],
    ) => api.put<Prompt[]>(`/api/brands/${brandId}/prompts`, { prompts }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts", brandId] });
    },
  });
}

export function useReplacePrompts(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      prompts: {
        id?: string;
        text: string;
        is_active: boolean;
        category?: string | null;
      }[],
    ) =>
      api.post<{ prompts: Prompt[]; count: number; replaced: boolean }>(
        `/api/brands/${brandId}/prompts/replace`,
        { prompts },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts", brandId] });
    },
  });
}

export function useRetryOnboarding(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ status: Brand["status"]; updated_at: string }>(
        `/api/brands/${brandId}/onboard`,
      ),
    onSuccess: async (retry) => {
      // Replace the cached error state before Onboarding switches back to its
      // analyzing screen. This also immediately re-enables useBrand polling.
      queryClient.setQueryData<Brand>(["brand", brandId], (brand) =>
        brand
          ? {
              ...brand,
              status: retry.status,
              updated_at: retry.updated_at,
            }
          : brand,
      );
      queryClient.setQueryData<Brand[]>(["brands"], (brands) =>
        brands?.map((brand) =>
          brand.id === brandId
            ? {
                ...brand,
                status: retry.status,
                updated_at: retry.updated_at,
              }
            : brand,
        ),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["brand", brandId] }),
        queryClient.invalidateQueries({ queryKey: ["brands"] }),
      ]);
      toast.success("Brand analysis restarted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRegeneratePrompts(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ prompts: Prompt[]; count: number }>(
        `/api/brands/${brandId}/prompts/regenerate`,
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["prompts", brandId] });
      toast.success(`Generated ${data.count} search-optimized prompts`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useRunMonitoring(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ run_id: string; status: string }>(
        `/api/brands/${brandId}/run`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand", brandId] });
      toast.success("Monitoring started");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
