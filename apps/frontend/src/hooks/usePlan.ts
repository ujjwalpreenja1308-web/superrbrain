import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { PLAN_LIMITS } from "@covable/shared";
import type { PlanTier, PlanLimits } from "@covable/shared";

export type { PlanTier, PlanLimits };

interface MeResponse {
  plan: PlanTier;
  status: string;
  trial_expires_at: string | null;
  current_period_end: string | null;
  dodo_subscription_id: string | null;
}

export interface UsePlanResult extends PlanLimits {
  tier: PlanTier;
  trialExpired: boolean;
  trialExpiresAt: Date | null;
  hasAccess: boolean;
  isLoading: boolean;
}

export function usePlan(): UsePlanResult {
  const { user } = useAuth();

  const { data: me, isLoading } = useQuery<MeResponse>({
    queryKey: ["me", user?.id],
    queryFn: () => api.get<MeResponse>("/api/me"),
    enabled: !!user,
    staleTime: 60_000,
  });

  const rawTier = me?.plan ?? "trial";
  const tier = (rawTier in PLAN_LIMITS ? rawTier : "trial") as PlanTier;

  const trialExpiresAt = me?.trial_expires_at ? new Date(me.trial_expires_at) : null;
  const trialExpired = tier === "trial" && trialExpiresAt !== null && trialExpiresAt < new Date();
  const hasAccess = tier !== "trial" || !trialExpired;

  return {
    ...PLAN_LIMITS[tier],
    tier,
    trialExpired,
    trialExpiresAt,
    hasAccess,
    isLoading: isLoading && !!user,
  };
}

export function getPlanLimits(tier: PlanTier) {
  return PLAN_LIMITS[tier];
}

/** Activate trial by calling /api/me — it auto-creates the subscription row if absent */
export function useActivateTrial() {
  const { user } = useAuth();
  const { refetch } = useQuery<MeResponse>({
    queryKey: ["me", user?.id],
    queryFn: () => api.get<MeResponse>("/api/me"),
    enabled: !!user,
    staleTime: 60_000,
  });
  // The GET /api/me call itself creates the trial row — nothing extra needed.
  return { refetch };
}
