import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export type PlanTier = "trial" | "starter" | "growth" | "scale";

export interface PlanLimits {
  tier: PlanTier;
  maxBrands: number;
  maxPrompts: number;
  scanFrequency: "weekly" | "daily" | "realtime";
  hasExecution: boolean;
  hasBlog: boolean;
  hasApiAccess: boolean;
  label: string;
  price: number | null;
  trialExpired: boolean;
  trialExpiresAt: Date | null;
  hasAccess: boolean; // false = show hard paywall
}

const PLAN_CONFIG: Record<PlanTier, Omit<PlanLimits, "trialExpired" | "trialExpiresAt" | "hasAccess">> = {
  trial: {
    tier: "trial",
    maxBrands: 1,
    maxPrompts: 10,
    scanFrequency: "weekly",
    hasExecution: false,
    hasBlog: false,
    hasApiAccess: false,
    label: "Trial",
    price: null,
  },
  starter: {
    tier: "starter",
    maxBrands: 1,
    maxPrompts: 10,
    scanFrequency: "weekly",
    hasExecution: false,
    hasBlog: false,
    hasApiAccess: false,
    label: "Starter",
    price: 59,
  },
  growth: {
    tier: "growth",
    maxBrands: 3,
    maxPrompts: 20,
    scanFrequency: "daily",
    hasExecution: true,
    hasBlog: false,
    hasApiAccess: false,
    label: "Growth",
    price: 149,
  },
  scale: {
    tier: "scale",
    maxBrands: 10,
    maxPrompts: 40,
    scanFrequency: "daily",
    hasExecution: true,
    hasBlog: true,
    hasApiAccess: true,
    label: "Scale",
    price: 349,
  },
};

export function usePlan(): PlanLimits {
  const { user } = useAuth();

  const rawTier = (user?.user_metadata?.plan as string | undefined) ?? "trial";
  const tier = (rawTier in PLAN_CONFIG ? rawTier : "trial") as PlanTier;

  const trialExpiresAt = user?.user_metadata?.trial_expires_at
    ? new Date(user.user_metadata.trial_expires_at as string)
    : null;

  const trialExpired = tier === "trial" && trialExpiresAt !== null && trialExpiresAt < new Date();

  // Has access if: paid plan, or active trial (not expired)
  const hasAccess = tier !== "trial" || !trialExpired;

  return {
    ...PLAN_CONFIG[tier],
    trialExpired,
    trialExpiresAt,
    hasAccess,
  };
}

export function getPlanLimits(tier: PlanTier) {
  return PLAN_CONFIG[tier];
}

/** Call once on first dashboard load to set trial_expires_at on new users */
export function useActivateTrial() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const mutation = useMutation({
    mutationFn: () => api.post<{ plan: string; trial_expires_at: string }>("/api/me/activate-trial"),
    onSuccess: () => {
      // Refresh auth session so user_metadata updates propagate
      queryClient.invalidateQueries();
    },
  });

  useEffect(() => {
    // Only activate if user exists and has no plan yet
    if (user && !user.user_metadata?.plan) {
      mutation.mutate();
    }
  }, [user?.id]);
}
