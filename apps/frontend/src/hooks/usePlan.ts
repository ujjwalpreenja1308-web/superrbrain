import { useAuth } from "@/hooks/useAuth";

export type PlanTier = "trial" | "starter" | "growth" | "scale";

export interface PlanLimits {
  tier: PlanTier;
  maxBrands: number;
  maxPrompts: number;
  scanFrequency: "weekly" | "daily" | "realtime";
  hasExecution: boolean;   // Reddit execution engine
  hasBlog: boolean;        // Blog post generation
  hasApiAccess: boolean;
  label: string;
  price: number | null;    // monthly price, null = trial
}

const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
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

  // Plan is stored in user_metadata by the backend after Dodo webhook
  const rawTier = (user?.user_metadata?.plan as string | undefined) ?? "trial";
  const tier = (rawTier in PLAN_LIMITS ? rawTier : "trial") as PlanTier;

  return PLAN_LIMITS[tier];
}

export function getPlanLimits(tier: PlanTier): PlanLimits {
  return PLAN_LIMITS[tier];
}
