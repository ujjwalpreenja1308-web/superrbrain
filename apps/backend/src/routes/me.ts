import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";
import { cancelDodoSubscription, getCustomerEmail, getCustomerId, getMetadata, getPlanFromDodoData, retrieveDodoSubscription } from "../lib/dodo.js";
import { AppError } from "../middleware/error.js";
import type { AppVariables } from "../types.js";
import { PLAN_LIMITS } from "@covable/shared";

const meRoutes = new Hono<{ Variables: AppVariables }>();

const TRIAL_DAYS = 14;

/**
 * GET /api/me
 * Returns current user's plan from the subscriptions table.
 */
meRoutes.get("", async (c) => {
  const userId = c.get("userId");
  const isSuperAdmin = c.get("isSuperAdmin");

  const { data: sub, error: subError } = await supabaseAdmin
    .from("subscriptions")
    .select("plan, plan_override, status, trial_expires_at, current_period_end, dodo_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (subError) {
    console.error("[me] Failed to load subscription", { userId, error: subError.message });
    throw new AppError(500, "Failed to load plan");
  }

  if (!sub) {
    // No subscription row yet — create trial
    const trialExpiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await supabaseAdmin.from("subscriptions").insert({
      user_id: userId,
      plan: "trial",
      status: "active",
      trial_expires_at: trialExpiresAt,
    });
    if (insertError) {
      console.error("[me] Failed to create trial subscription", { userId, error: insertError.message });
      throw new AppError(500, "Failed to create trial");
    }
    return c.json({
      plan: isSuperAdmin ? "pro" : "trial",
      status: "active",
      trial_expires_at: trialExpiresAt,
      dodo_subscription_id: null,
      is_superadmin: isSuperAdmin,
      max_brands: isSuperAdmin ? null : PLAN_LIMITS.trial.maxBrands,
    });
  }

  const effectivePlan = String(
    isSuperAdmin ? "pro" : sub.plan_override ?? sub.plan,
  );
  if (!Object.prototype.hasOwnProperty.call(PLAN_LIMITS, effectivePlan)) {
    console.error("[me] Subscription has an invalid plan", { userId, plan: effectivePlan });
    throw new AppError(500, "Subscription plan is invalid");
  }
  const effectiveTier = effectivePlan as keyof typeof PLAN_LIMITS;

  return c.json({
    plan: effectiveTier,
    status: sub.status,
    trial_expires_at: sub.trial_expires_at ?? null,
    current_period_end: sub.current_period_end ?? null,
    dodo_subscription_id: sub.dodo_subscription_id ?? null,
    is_superadmin: isSuperAdmin,
    max_brands: isSuperAdmin ? null : PLAN_LIMITS[effectiveTier].maxBrands,
  });
});

/**
 * POST /api/me/cancel
 * Cancels billing with Dodo, then downgrades the local account immediately.
 */
meRoutes.post("/cancel", async (c) => {
  const userId = c.get("userId");

  const { data: subscription, error: loadError } = await supabaseAdmin
    .from("subscriptions")
    .select("dodo_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (loadError) throw new AppError(500, "Failed to load billing subscription");
  if (!subscription?.dodo_subscription_id) {
    throw new AppError(409, "No active billing subscription was found");
  }

  await cancelDodoSubscription(subscription.dodo_subscription_id);

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      plan: "trial",
      status: "cancelled",
      dodo_subscription_id: null,
      current_period_end: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) throw new AppError(500, "Billing was cancelled, but the local plan could not be updated");

  return c.json({ success: true });
});

/**
 * POST /api/me/confirm-subscription
 * Verifies a Dodo subscription server-side and activates the user's plan.
 * This recovers checkout redirects when the webhook is delayed or was missed.
 */
meRoutes.post("/confirm-subscription", async (c) => {
  const user = c.get("user");
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const subscriptionId = typeof body.subscription_id === "string" ? body.subscription_id : "";

  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) {
    throw new AppError(400, "Invalid subscription");
  }

  const subscription = await retrieveDodoSubscription(subscriptionId);
  const status = subscription.status as string | undefined;
  if (status !== "active") {
    throw new AppError(409, "Subscription is not active yet");
  }

  const plan = getPlanFromDodoData(subscription);
  if (!plan) {
    console.warn("[me] Dodo subscription has no known product/plan", { userId, subscriptionId });
    throw new AppError(409, "Subscription plan is not recognized");
  }

  const metadataUserId = getMetadata(subscription)?.user_id;
  const customerEmail = getCustomerEmail(subscription);
  if (metadataUserId && metadataUserId !== userId) {
    console.warn("[me] Dodo subscription belongs to another user", { userId, metadataUserId, subscriptionId });
    throw new AppError(403, "Subscription belongs to another account");
  }

  if (!metadataUserId && customerEmail?.toLowerCase() !== user.email?.toLowerCase()) {
    console.warn("[me] Dodo subscription email mismatch", { userId, customerEmail, subscriptionId });
    throw new AppError(403, "Subscription belongs to another account");
  }

  const currentPeriodEnd = (subscription.next_billing_date ?? subscription.expires_at) as string | undefined;
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan,
        status: "active",
        plan_activated_at: new Date().toISOString(),
        current_period_end: currentPeriodEnd ?? null,
        dodo_customer_id: getCustomerId(subscription) ?? null,
        dodo_subscription_id: subscriptionId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[me] Failed to confirm Dodo subscription", { userId, subscriptionId, error: error.message });
    throw new AppError(500, "Failed to activate subscription");
  }

  return c.json({ plan, status: "active", dodo_subscription_id: subscriptionId });
});

export default meRoutes;
