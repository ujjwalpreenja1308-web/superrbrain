import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";
import type { AppVariables } from "../types.js";

const meRoutes = new Hono<{ Variables: AppVariables }>();

const TRIAL_DAYS = 3;

/**
 * POST /api/me/activate-trial
 * Called once on first dashboard load.
 * If user has no plan yet, sets plan=trial and trial_expires_at=now+3days.
 * Idempotent — safe to call multiple times.
 */
meRoutes.post("/activate-trial", async (c) => {
  const userId = c.get("userId");

  const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !user) return c.json({ error: "User not found" }, 404);

  // Already has a plan set — nothing to do
  if (user.user_metadata?.plan) {
    return c.json({
      plan: user.user_metadata.plan,
      trial_expires_at: user.user_metadata.trial_expires_at ?? null,
    });
  }

  const trialExpiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...user.user_metadata,
      plan: "trial",
      trial_expires_at: trialExpiresAt,
    },
  });

  return c.json({ plan: "trial", trial_expires_at: trialExpiresAt });
});

/**
 * GET /api/me
 * Returns current user's plan info.
 */
meRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !user) return c.json({ error: "User not found" }, 404);

  return c.json({
    id: user.id,
    email: user.email,
    plan: user.user_metadata?.plan ?? null,
    trial_expires_at: user.user_metadata?.trial_expires_at ?? null,
    dodo_subscription_id: user.user_metadata?.dodo_subscription_id ?? null,
  });
});

export default meRoutes;
