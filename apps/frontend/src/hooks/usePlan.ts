import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect } from "react";

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
  hasAccess: boolean;
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

interface Subscription {
  plan: PlanTier;
  status: string;
  trial_expires_at: string | null;
  current_period_end: string | null;
}

/** Fetch subscription from the subscriptions table */
async function fetchSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status, trial_expires_at, current_period_end")
    .eq("user_id", userId)
    .single();

  if (error) return null;
  return data as Subscription;
}

export function usePlan(): PlanLimits {
  const { user } = useAuth();

  const { data: subscription } = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: () => fetchSubscription(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });

  const rawTier = subscription?.plan ?? "trial";
  const tier = (rawTier in PLAN_CONFIG ? rawTier : "trial") as PlanTier;

  const trialExpiresAt = subscription?.trial_expires_at
    ? new Date(subscription.trial_expires_at)
    : null;

  const trialExpired = tier === "trial" && trialExpiresAt !== null && trialExpiresAt < new Date();
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

/** Create a trial subscription row if the user doesn't have one yet */
export function useActivateTrial() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("subscriptions").insert({
        user_id: user!.id,
        plan: "trial",
        status: "active",
        trial_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error && error.code !== "23505") throw error; // 23505 = unique violation (already exists)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription", user?.id] });
    },
    onError: () => {
      // Silently fail
    },
  });

  useEffect(() => {
    if (user && mutation.status === "idle") {
      // Check if subscription exists first
      supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          if (!data) mutation.mutate();
        });
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
