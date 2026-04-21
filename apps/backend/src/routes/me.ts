import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";
import type { AppVariables } from "../types.js";

const meRoutes = new Hono<{ Variables: AppVariables }>();

const TRIAL_DAYS = 14;

/**
 * GET /api/me
 * Returns current user's plan from the subscriptions table.
 */
meRoutes.get("", async (c) => {
  const userId = c.get("userId");

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("plan, status, trial_expires_at, current_period_end, dodo_subscription_id")
    .eq("user_id", userId)
    .single();

  if (!sub) {
    // No subscription row yet — create trial
    const trialExpiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin.from("subscriptions").insert({
      user_id: userId,
      plan: "trial",
      status: "active",
      trial_expires_at: trialExpiresAt,
    });
    return c.json({ plan: "trial", status: "active", trial_expires_at: trialExpiresAt, dodo_subscription_id: null });
  }

  return c.json({
    plan: sub.plan,
    status: sub.status,
    trial_expires_at: sub.trial_expires_at ?? null,
    current_period_end: sub.current_period_end ?? null,
    dodo_subscription_id: sub.dodo_subscription_id ?? null,
  });
});

/**
 * POST /api/me/cancel
 * Downgrades user to trial immediately (no Dodo API call — just DB update).
 * Real cancellation should be handled via Dodo dashboard or webhook.
 */
meRoutes.post("/cancel", async (c) => {
  const userId = c.get("userId");

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({ plan: "trial", status: "cancelled", updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) return c.json({ error: "Failed to cancel plan" }, 500);

  return c.json({ success: true });
});

export default meRoutes;
