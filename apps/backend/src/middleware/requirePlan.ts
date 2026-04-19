import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "./error.js";
import { PLAN_LIMITS, type PlanTier } from "@covable/shared";

export async function getPlanTier(userId: string): Promise<PlanTier> {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("plan, status, trial_expires_at")
    .eq("user_id", userId)
    .single();

  if (!data) return "trial";

  const tier = (data.plan ?? "trial") as PlanTier;

  if (tier === "trial" && data.trial_expires_at && new Date(data.trial_expires_at) < new Date()) {
    throw new AppError(403, "Your trial has expired. Please upgrade to continue.");
  }

  return tier;
}

export async function checkFeature(userId: string, feature: "reddit" | "execution"): Promise<void> {
  const tier = await getPlanTier(userId);
  const limits = PLAN_LIMITS[tier];

  if (feature === "reddit" && !limits.hasReddit) {
    throw new AppError(403, "Reddit tracking requires the Growth or Pro plan.");
  }
  if (feature === "execution" && !limits.hasExecution) {
    throw new AppError(403, "Content execution requires the Growth or Pro plan.");
  }
}

export async function checkPromptLimit(userId: string, brandId: string, newCount: number): Promise<void> {
  const tier = await getPlanTier(userId);
  const max = PLAN_LIMITS[tier].maxPrompts;
  if (newCount > max) {
    throw new AppError(403, `Your ${PLAN_LIMITS[tier].label} plan allows up to ${max} prompts. You submitted ${newCount}.`);
  }
}

export async function checkRedditLimits(userId: string, keywords: string[], subreddits: string[]): Promise<void> {
  const tier = await getPlanTier(userId);
  const limits = PLAN_LIMITS[tier];

  if (!limits.hasReddit) {
    throw new AppError(403, "Reddit tracking requires the Growth or Pro plan.");
  }
  if (keywords.length > limits.maxKeywords) {
    throw new AppError(403, `Your ${limits.label} plan allows up to ${limits.maxKeywords} keywords. You submitted ${keywords.length}.`);
  }
  if (subreddits.length > limits.maxSubreddits) {
    throw new AppError(403, `Your ${limits.label} plan allows up to ${limits.maxSubreddits} subreddits. You submitted ${subreddits.length}.`);
  }
}
