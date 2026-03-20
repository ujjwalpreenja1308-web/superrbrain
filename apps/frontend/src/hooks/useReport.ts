import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Citation, CitationGap } from "@superrbrain/shared";

interface EngineBreakdown {
  engine: string;
  total: number;
  mentioned: number;
  score: number;
}

export function useReport(brandId?: string) {
  return useQuery({
    queryKey: ["report", brandId],
    queryFn: () =>
      api.get<{ engine_breakdown: EngineBreakdown[] }>(
        `/api/brands/${brandId}/report`
      ),
    enabled: !!brandId,
  });
}

export function useCitations(brandId?: string) {
  return useQuery({
    queryKey: ["citations", brandId],
    queryFn: () =>
      api.get<(Citation & { frequency_score: number })[]>(
        `/api/brands/${brandId}/citations`
      ),
    enabled: !!brandId,
  });
}

export function useGaps(brandId?: string) {
  return useQuery({
    queryKey: ["gaps", brandId],
    queryFn: () => api.get<CitationGap[]>(`/api/brands/${brandId}/gaps`),
    enabled: !!brandId,
  });
}
