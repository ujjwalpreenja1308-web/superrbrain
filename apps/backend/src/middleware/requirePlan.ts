import type { User } from "@supabase/supabase-js";
import { AppError } from "./error.js";

type PlanTier = "trial" | "starter" | "growth" | "scale";

/**
 * Check that the user's plan includes the given feature.
 * Call this at the top of route handlers that require a paid plan.
 * Throws an AppError (→ 403) if the check fails.
 */
export function checkPlan(user: User, feature: "execution" | "blog"): void {
  const plan = (user.user_metadata?.plan ?? "trial") as PlanTier;
  const trialExpiresAt = user.user_metadata?.trial_expires_at as string | undefined;

  if (plan === "trial" && trialExpiresAt != null && new Date(trialExpiresAt) < new Date()) {
    throw new AppError(403, "Your trial has expired. Please upgrade to continue.");
  }

  if (feature === "execution" && plan !== "growth" && plan !== "scale") {
    throw new AppError(403, "Content execution requires a Growth or Scale plan.");
  }

  if (feature === "blog" && plan !== "scale") {
    throw new AppError(403, "Blog generation requires the Scale plan.");
  }
}
